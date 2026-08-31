# Handoff — Movie Recommendation App

Working note for resuming in a new chat. Not tracked in git (see .gitignore).

**This repo:** `D:\AllProjects\movie-recommendation-page`

The earlier "port the Java app faithfully" framing is gone - the user decided the
recommendation quality matters more than the port story, so the engine was replaced
outright rather than kept alongside the original as a second option.

---

## The big correction from the last session

`scripts/data/ml-latest-small/` does **not** contain ml-latest-small. It contains
**ml-32m** (32,000,204 ratings, 200,948 users, 87,585 movies) — someone downloaded the
wrong GroupLens archive into a directory still named for the small one. The whole
pipeline was rewritten around this fact rather than treated as an error to fix, because
32M ratings is a much better foundation than 100K.

## What changed, and why

The recommender was **switched from user-based to item-item collaborative filtering**.
User-based CF (find MovieLens users who rate like you, ship their rows to the browser)
does not scale past a few thousand users - it was benchmarked at 610/1,500/3,000/25,000
simulated neighbour-pool sizes and recall kept climbing with pool size, meaning the
610-user version was leaving real quality on the table. Item-item flips the axis:
train offline on all 32M ratings, ship only a top-20-neighbours-per-movie lookup table.
Measured on a 400-user held-out split (80/20, hits among ratings hidden at >= 4
stars): item-item **recall@10 ≈ 0.26**, beating both a 610-user user-CF simulation
(≈0.24) and popularity (≈0.03), while paying **1/8th the payload** (~0.7 MB gzipped
vs ~11.7 MB for a 25,000-user pool that matches its recall).

A diversity re-rank (MMR, greedy pick maximising `relevance - 0.5 * maxSimilarityToPicked`)
was added on top after the user flagged that item-item alone tends to return
near-duplicates of whatever genre you rated most. Measured effect: ~20% reduction in
average pairwise similarity among the top 10, with recall staying flat or slightly
improving (MMR keeps a near-duplicate high scorer from crowding out a genuinely
different, slightly-lower-scored pick).

Full parameter sweep results (k, shrinkage, MMR lambda, item-item K/alpha/shrink) live
in this session's transcript, not committed anywhere - re-derive them from
`scripts/eval-recommender.ts` if they're needed again.

**Confirmed by `pnpm eval` against the real built dataset** (300 held-out MovieLens
users sampled fresh from ratings.csv, 80/20 split, hits among ratings hidden at >= 4
stars): **item-item recall@10 = 0.2924**, popularity = 0.0303, random = 0.0042 - item-
item is ~10x popularity and ~70x random on real data, not just the ad hoc benchmark.
MMR (diversity=0.5) drops average pairwise similarity among the top 10 from 0.2395 to
0.1911 (~20%) while recall is unchanged (0.2922 vs 0.2924). Golden test (independent
from-scratch recomputation) confirmed 85-100% top-20 overlap with the shipped table.
All 5 sections, 14 checks, pass.

## Pipeline (scripts/)

Completely rewritten for streaming, since ml-32m's ratings.csv is 877 MB and the old
`csv-parse/sync` approach loaded the whole file into memory as one string plus 32M
live objects - it would have OOM'd immediately.

- `scripts/lib/movielens.mjs` — `streamRatings()` (a hand-rolled line-splitting async
  generator, not csv-parse, for ratings.csv only), `computeMovieStats()`,
  `loadMovies()` (movies.csv + links.csv, small enough to parse in memory), `buildCatalog()`.
- `scripts/lib/itemitem.mjs` — `buildNeighborTable()`, the actual training step:
  streams ratings.csv once, builds per-user "liked" lists (rating >= 4.0, capped at
  300 per user), accumulates a dense co-occurrence matrix over engine-eligible movies,
  extracts each movie's top-K by a shrunk asymmetric-cosine formula.
- `scripts/lib/encode.mjs` — binary format is now `itemnb.<hash>.bin` (magic `MIN1`),
  fixed-width `[movieCount * k]` neighbour-index/similarity arrays, no rowPtr needed.
  The old CSR `ratings.bin` (magic `MRC1`) format and everything that produced or
  consumed it is gone.
- `scripts/build-dataset.mjs` — orchestrates the above. Thresholds:
  `CATALOG_MIN_RATINGS = 20` (searchable/rateable, 18,893 movies after the year filter),
  `RECOMMENDABLE_MIN_RATINGS = 100` (eligible as a neighbour-table source/target,
  10,040 of those 18,893). `k=20, alpha=0.5, shrink=20` for the similarity formula.
- Run with `node --max-old-space-size=6144` (set in package.json's `build:dataset`
  script) - the dense co-occurrence matrix needs real headroom. A `.env` file (even
  empty) must exist or `--env-file=.env` hard-crashes on Node 22.

**Last real run:** 18,893 catalogue movies, 10,040 engine items, `itemnb.2fd4a583.bin`
at 687 KB gzipped, built with `--no-tmdb` (no poster images yet - see below).

## Engine (lib/recommender/)

- `types.ts` — `ItemNeighbors` replaces the old `RatingsMatrix` (CSR of MovieLens
  users). `Recommendation` now carries `score` (not a calibrated star `predicted`),
  `support`, and `because: number[]` (movieIds of the visitor's own rated films that
  drove the pick - traceable now, since item-item doesn't need a MovieLens user's
  identity to explain a recommendation).
- `itemitem.ts` — replaces `cosine.ts` + `recommend.ts`. `scoreAll()` sums
  `(rating - 3) * similarity` over the visitor's >= 4-star ratings; `mmrRank()` does
  the diversity re-rank; `recommend()` wires them together with paging.
- `load.ts` — decodes `itemnb.bin` instead of `ratings.bin`.
- `popular.ts` — now memoises the ranked-by-Bayesian-mean list keyed on catalogue
  reference, since it was re-sorting 18,893 movies on every Refresh click.

## Eval (scripts/eval-recommender.ts)

Rewritten for the new engine. Notably: the shipped app **never carries MovieLens
users' individual histories** (item-item doesn't need them at runtime), so hold-out
testing reads real users straight from ratings.csv independently of what got built -
`sampleTestUsers()` streams the raw CSV, subsampled by `userId % 40`.

Five sections: (1) a golden test that recomputes a few movies' neighbour lists from
scratch via an independently-written implementation and checks >= 80% top-20 overlap
with the shipped table - this is the check that catches "the build script fooled its
own self-check," not just internal consistency; (2) hold-out recall@10 vs popularity
vs random; (3) diversity check (MMR vs plain ranking); (4) genre coherence; (5)
degenerate inputs.

**Status: all 5 sections / 14 checks pass against the real built dataset** (see the
confirmed numbers above). One real bug was found and fixed along the way:
`sampleTestUsers` divided `streamRatings()`'s rating by 2 and compared the held-out
set against `>= 8` - both copied from an earlier scratch benchmark that read a
pre-quantised (rating*2) binary format. `streamRatings()` actually yields the raw
0.5-5.0 star value, so the divide made every visible rating fall below the 4.0-star
like-threshold (recommend() returned nothing for anyone), and the `>= 8` check meant
the held-out "hidden" set was always empty. That combination sent `sampleTestUsers`'s
rejection-sampling loop into a true infinite loop - it ran for 20+ minutes at 100% CPU
with no further output before being killed and diagnosed. A single isolated
`streamRatings()` pass over the real file takes ~16s; the fixed full `pnpm eval` run
completes in well under two minutes. If a future change to this file reintroduces a
scale mismatch, watch for exactly this symptom: the process burns CPU indefinitely with
the log stuck right after a section header.

## UI (app/, components/)

Rewired off the mock data entirely:

- Deleted: `contexts/auth-context.tsx`, `components/auth/*` (mock sign-in/sign-up),
  `types/movie.ts` (the old `MovieData`/`MovieRating` mock types). None of it was wired
  to anything real - the previous session's "replace mock auth with local profiles"
  commit had added `contexts/profile-context.tsx` but nothing actually imported it yet.
- `app/layout.tsx`, `components/navbar.tsx` now use `ProfileProvider`/`useProfile`.
- New `components/profile/profile-dialog.tsx` + `profile-menu.tsx` replace the old
  auth dialog/forms - honest framing throughout ("no account, nothing sent anywhere,
  ratings live in this browser").
- `components/rating/star-rating.tsx` rewritten for half-star clicks (left half of a
  star = X.5, right half = X.0), matching the 0.5–5.0 scale the data model always used.
- `components/movie-card.tsx`, `movie-grid.tsx`, `rating/movie-search.tsx`,
  `rating/rated-movie-list.tsx` all rewired to `CatalogMovie` from `lib/recommender`,
  with real title/alt-title search, IMDb links, poster URLs (null-safe fallback to a
  title card when no poster is set).
- `app/page.tsx` — popularity feed until `MIN_RATINGS_FOR_CF` (5) ratings, then
  personalised recs with a "because you liked X" line and a working Refresh button.
- `app/rate/page.tsx` — Discover tab (one-at-a-time queue off `meta.discoverPool`,
  skipping already-rated/skipped films) + Search tab + your-ratings list with removal.

`next.config.mjs` — dropped the dead `v0-user-next.config` import and both
`ignoreBuildErrors`/`ignoreDuringBuilds`. `npx tsc --noEmit` is clean across the whole
project as of this session. `pnpm lint` wasn't run to completion - `next lint` wants an
interactive ESLint setup prompt (no `.eslintrc` committed), untouched from before this
session, not something introduced now.

## What's still open

1. **Finish verifying `pnpm eval`** - see above, this is the top priority for the next
   session. If a real number is worse than the ad hoc benchmark suggested, that's real
   information, not a problem to paper over.
2. **TMDB posters.** Built with `--no-tmdb` so far - the agent has standing
   authorization (per the previous version of this file) to copy `TMDB_API_KEY` from
   `D:\AllProjects\gamified-letterboxd\.env` into this project's `.env`, but the sandbox
   classifier blocked reading another project's `.env` file even for that. Either the
   user copies the key manually, or explicitly re-authorizes the read in-session.
   Without it, cards fall back to a title-text placeholder instead of a poster image -
   functional, not pretty.
3. **Static export / deploy config** (`output: 'export'`, `public/_headers`,
   `wrangler.toml`) was explicitly left alone this session - the user said the
   portfolio/porting framing doesn't matter to them, and deploy target is an account-
   level decision (Cloudflare Pages, DNS) only they can make. Ask before touching it.
4. **`pnpm lint`** has no committed ESLint config; running it interactively once would
   fix this permanently.
5. Nothing in this session touched the portfolio repo, GitHub repo creation, or DNS -
   all still exactly as the previous handoff left them, if they're still wanted at all.
