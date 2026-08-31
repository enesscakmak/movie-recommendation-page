// Offline checks on the recommender. Run with `pnpm eval`.
//
// Deliberately not a test framework: a handful of checks against committed
// data don't justify pulling vitest into a static site. This exits non-zero
// on failure so it still works in CI.
//
// Unlike the shipped app, this script has access to the raw ratings.csv (it
// runs on a dev machine, not in a browser) - sections 2-4 use that to build
// independent test data the shipped artifact never carries.

import { readFileSync, existsSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"

import { decodeNeighborTable, expandCatalog } from "../lib/recommender/load"
import { itemSimilarity, recommend, hasUsableNeighbors } from "../lib/recommender/itemitem"
import { popularMovies } from "../lib/recommender/popular"
import type { CatalogMovie, DatasetMeta, ItemNeighbors, UserRating } from "../lib/recommender/types"
import { streamRatings, EXPECTED } from "./lib/movielens.mjs"
import { LIKE_THRESHOLD } from "./lib/itemitem.mjs"

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, "..")
const DATA = join(ROOT, "public", "data")
const RAW_DIR = join(HERE, "data", "ml-latest-small")
const EXPECTED_RATINGS = EXPECTED.ratings

let failures = 0
function ok(label: string, passed: boolean, detail = "") {
  console.log(`  ${passed ? "PASS" : "FAIL"}  ${label}${detail ? ` - ${detail}` : ""}`)
  if (!passed) failures++
}

function load(): { catalog: CatalogMovie[]; nb: ItemNeighbors; meta: DatasetMeta } {
  const metaPath = join(DATA, "dataset-meta.json")
  if (!existsSync(metaPath)) {
    console.error(`\nNo dataset at ${DATA}. Run \`pnpm build:dataset\` first.\n`)
    process.exit(1)
  }
  const meta = JSON.parse(readFileSync(metaPath, "utf8")) as DatasetMeta
  const catalog = expandCatalog(JSON.parse(readFileSync(join(DATA, "catalog.json"), "utf8")))
  const buf = readFileSync(join(DATA, meta.neighborsFile))
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
  return { catalog, nb: decodeNeighborTable(ab as ArrayBuffer), meta }
}

/** Deterministic PRNG, so a failing run reproduces. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ---------------------------------------------------------------------------
// 1. Golden test: pick a handful of well-known movies and recompute their
//    neighbour lists from scratch, straight off ratings.csv, with a small
//    independent implementation. This is the check that catches "the build
//    script has a bug that also fooled its own self-check" - re-deriving the
//    same numbers a second, differently-written way is the only thing that
//    actually verifies the shipped artifact is correct rather than merely
//    internally consistent.
// ---------------------------------------------------------------------------
async function goldenTest(catalog: CatalogMovie[], nb: ItemNeighbors, meta: DatasetMeta) {
  console.log("\n1. Golden test (shipped neighbours vs from-scratch recomputation)")

  const byRatingCount = [...catalog].sort((a, b) => b.ratingCount - a.ratingCount)
  const engineOnly = byRatingCount.filter((m) => m.ratingCount >= meta.recommendableMinRatings)
  const sample = [engineOnly[0], engineOnly[Math.floor(engineOnly.length / 2)], engineOnly[engineOnly.length - 1]]
  const targetCols = new Set(sample.map((m) => m.index))
  const colOfMovieId = new Map(catalog.map((m) => [m.movieId, m.index]))
  const engineIds = new Set(engineOnly.map((m) => m.movieId))

  console.log(`     recomputing co-occurrence for: ${sample.map((m) => m.title).join(", ")}`)

  const likeCount = new Map<number, number>()
  const cooc = new Map<number, Map<number, number>>() // target col -> (other col -> count)
  for (const c of targetCols) cooc.set(c, new Map())

  // Pass 1: like-counts (needed for the similarity formula's denominator).
  // Pass 2: per-user liked lists, capped like the real build - ratings.csv
  // is not guaranteed sorted by user, so this groups with a Map rather than
  // assuming order.
  let rows = 0
  for await (const { movieId, rating } of streamRatings(RAW_DIR)) {
    rows++
    if (rating < LIKE_THRESHOLD || !engineIds.has(movieId)) continue
    likeCount.set(movieId, (likeCount.get(movieId) ?? 0) + 1)
  }

  const likedByUser = new Map<number, number[]>()
  for await (const { userId, movieId, rating } of streamRatings(RAW_DIR)) {
    if (rating < LIKE_THRESHOLD || !engineIds.has(movieId)) continue
    let arr = likedByUser.get(userId)
    if (!arr) { arr = []; likedByUser.set(userId, arr) }
    if (arr.length < 300) arr.push(movieId)
  }
  for (const liked of likedByUser.values()) {
    for (const mid of liked) {
      const col = colOfMovieId.get(mid)
      if (col === undefined || !targetCols.has(col)) continue
      const m = cooc.get(col)!
      for (const other of liked) {
        if (other === mid) continue
        const oc = colOfMovieId.get(other)
        if (oc === undefined) continue
        m.set(oc, (m.get(oc) ?? 0) + 1)
      }
    }
  }

  const ALPHA = 0.5, SHRINK = 20
  let worstOverlap = 1
  for (const m of sample) {
    const counts = cooc.get(m.index)!
    const ranked = [...counts.entries()]
      .map(([col, c]) => {
        const other = catalog[col]
        const sim = c / (Math.pow(likeCount.get(m.movieId) ?? 1, 1 - ALPHA) * Math.pow(likeCount.get(other.movieId) ?? 1, ALPHA) + SHRINK)
        return [col, sim] as const
      })
      .sort((a, b) => b[1] - a[1])
      .slice(0, nb.k)
      .map(([col]) => col)

    const shippedSet = new Set<number>()
    for (let t = 0; t < nb.k; t++) {
      const idx = nb.neighborIdx[m.index * nb.k + t]
      if (idx !== 0xffff) shippedSet.add(idx)
    }
    const recomputedSet = new Set(ranked)
    const overlap = [...shippedSet].filter((c) => recomputedSet.has(c)).length / Math.max(1, shippedSet.size)
    worstOverlap = Math.min(worstOverlap, overlap)
    console.log(`     ${m.title}: ${(overlap * 100).toFixed(0)}% of shipped top-${nb.k} confirmed by independent recomputation`)
  }
  ok("independent recomputation agrees with the shipped table", worstOverlap >= 0.8, `worst overlap ${(worstOverlap * 100).toFixed(0)}%`)
  ok("ratings.csv still has the expected row count", rows === EXPECTED_RATINGS, `${fmtN(rows)} rows`)
}

// ---------------------------------------------------------------------------
// 2. Hold-out: item-item must beat popularity, not merely beat random.
//    Test users are sampled fresh from ratings.csv - the shipped app never
//    carries MovieLens users' histories, so this data exists only here.
// ---------------------------------------------------------------------------
async function sampleTestUsers(catalog: CatalogMovie[], count: number) {
  const colOfMovieId = new Map(catalog.map((m) => [m.movieId, m.index]))
  // streamRatings() yields the raw 0.5..5.0 star value, not a doubled/quantised one.
  const byUser = new Map<number, Array<[number, number]>>() // userId -> [movieId, rating][]
  for await (const { userId, movieId, rating } of streamRatings(RAW_DIR)) {
    if (userId % 40 !== 0) continue // subsample the population, not the per-user history
    if (!colOfMovieId.has(movieId)) continue
    let arr = byUser.get(userId)
    if (!arr) { arr = []; byUser.set(userId, arr) }
    arr.push([movieId, rating])
  }
  const eligible = [...byUser.entries()].filter(([, r]) => r.length >= 40 && r.length <= 600)
  const rnd = mulberry32(7)
  const picked: Array<{ userId: number; visible: UserRating[]; hidden: Set<number> }> = []
  const seen = new Set<number>()
  // Bounded rather than "while count unmet": if too few eligible users clear
  // a nonempty hidden set, looping forever beats returning a smaller sample.
  const maxAttempts = eligible.length * 5
  for (let attempt = 0; picked.length < count && attempt < maxAttempts; attempt++) {
    const [userId, items] = eligible[Math.floor(rnd() * eligible.length)]
    if (seen.has(userId)) continue
    seen.add(userId)
    const r = mulberry32(userId)
    const shuffled = [...items].sort(() => r() - 0.5)
    const cut = Math.floor(shuffled.length * 0.8)
    const visible: UserRating[] = shuffled.slice(0, cut).map(([movieId, rating]) => ({ movieId, rating, ratedAt: "" }))
    const hidden = new Set(shuffled.slice(cut).filter(([, rating]) => rating >= 4).map(([movieId]) => movieId))
    if (hidden.size > 0) picked.push({ userId, visible, hidden })
  }
  return picked
}

async function holdOut(catalog: CatalogMovie[], nb: ItemNeighbors, meta: DatasetMeta) {
  console.log("\n2. Hold-out recall@10 (item-item vs popularity vs random)")
  const users = await sampleTestUsers(catalog, 300)
  console.log(`     ${users.length} test users, 80/20 split, hits among ratings hidden at >= 4 stars`)

  const recallOf = (fn: (visible: UserRating[]) => number[]) =>
    users.reduce((t, u) => t + fn(u.visible).filter((id) => u.hidden.has(id)).length / Math.min(10, u.hidden.size), 0) / users.length

  const itemItemRecall = recallOf((visible) => recommend(visible, [], nb, catalog, { minRatingCount: meta.recommendableMinRatings }).map((r) => r.movieId))
  const popRecall = recallOf((visible) => {
    const seen = new Set(visible.map((r) => r.movieId))
    return popularMovies(catalog, { count: 10, minRatings: meta.recommendableMinRatings, excludeIds: seen }).map((m) => m.movieId)
  })
  const randRecall = recallOf((visible) => {
    const seen = new Set(visible.map((r) => r.movieId))
    const pool = catalog.filter((m) => m.ratingCount >= meta.recommendableMinRatings && !seen.has(m.movieId))
    const r2 = mulberry32(visible.length + 1000)
    const picks = new Set<number>()
    while (picks.size < 10 && picks.size < pool.length) picks.add(Math.floor(r2() * pool.length))
    return [...picks].map((i) => pool[i].movieId)
  })

  console.log(`     item-item  recall@10 = ${itemItemRecall.toFixed(4)}`)
  console.log(`     popularity recall@10 = ${popRecall.toFixed(4)}`)
  console.log(`     random     recall@10 = ${randRecall.toFixed(4)}`)
  ok("item-item beats popularity", itemItemRecall > popRecall, `${itemItemRecall.toFixed(4)} vs ${popRecall.toFixed(4)}`)
  ok("item-item beats random", itemItemRecall > randRecall, `${itemItemRecall.toFixed(4)} vs ${randRecall.toFixed(4)}`)

  return users
}

// ---------------------------------------------------------------------------
// 3. Diversity: MMR re-ranking should measurably reduce redundancy among the
//    top 10 without meaningfully hurting recall.
// ---------------------------------------------------------------------------
function diversityCheck(catalog: CatalogMovie[], nb: ItemNeighbors, meta: DatasetMeta, users: Array<{ visible: UserRating[]; hidden: Set<number> }>) {
  console.log("\n3. Diversity re-rank (MMR vs plain relevance ranking)")

  const avgPairwiseSim = (picks: number[][]) => {
    let sum = 0, pairs = 0
    for (const ids of picks) {
      const cols = ids.map((id) => catalog.find((m) => m.movieId === id)?.index).filter((c): c is number => c !== undefined)
      for (let a = 0; a < cols.length; a++) for (let b = a + 1; b < cols.length; b++) { sum += itemSimilarity(nb, cols[a], cols[b]); pairs++ }
    }
    return pairs > 0 ? sum / pairs : 0
  }
  const recallOf = (picks: number[][]) =>
    users.reduce((t, u, i) => t + picks[i].filter((id) => u.hidden.has(id)).length / Math.min(10, u.hidden.size), 0) / users.length

  const plain = users.map((u) => recommend(u.visible, [], nb, catalog, { minRatingCount: meta.recommendableMinRatings, diversity: 0 }).map((r) => r.movieId))
  const diverse = users.map((u) => recommend(u.visible, [], nb, catalog, { minRatingCount: meta.recommendableMinRatings }).map((r) => r.movieId))

  const simPlain = avgPairwiseSim(plain)
  const simDiverse = avgPairwiseSim(diverse)
  const recallPlain = recallOf(plain)
  const recallDiverse = recallOf(diverse)

  console.log(`     diversity=0    avg pairwise item-sim = ${simPlain.toFixed(4)}   recall@10 = ${recallPlain.toFixed(4)}`)
  console.log(`     diversity=0.5  avg pairwise item-sim = ${simDiverse.toFixed(4)}   recall@10 = ${recallDiverse.toFixed(4)}`)
  ok("MMR reduces redundancy among the top 10", simDiverse < simPlain, `${simDiverse.toFixed(4)} vs ${simPlain.toFixed(4)}`)
  ok("MMR does not meaningfully hurt recall", recallDiverse > recallPlain * 0.9, `${recallDiverse.toFixed(4)} vs ${recallPlain.toFixed(4)}`)
}

// ---------------------------------------------------------------------------
// 4. Genre coherence - the check you'd also run by hand in the UI.
// ---------------------------------------------------------------------------
function genreCoherence(catalog: CatalogMovie[], nb: ItemNeighbors, meta: DatasetMeta) {
  console.log("\n4. Genre coherence")

  const find = (title: string) =>
    catalog.find((c) => c.title.toLowerCase() === title.toLowerCase()) ??
    catalog.find((c) => c.title.toLowerCase().includes(title.toLowerCase()))

  const run = (titles: string[], wanted: string[], label: string) => {
    const found = titles.map(find).filter(Boolean) as CatalogMovie[]
    if (found.length < 3) {
      console.log(`     SKIP ${label} - only matched ${found.length}/${titles.length} titles in the catalogue`)
      return
    }
    const ratings: UserRating[] = found.map((mv) => ({ movieId: mv.movieId, rating: 5, ratedAt: "" }))
    const recs = recommend(ratings, [], nb, catalog, { count: 10, minRatingCount: meta.recommendableMinRatings })
    const byId = new Map(catalog.map((c) => [c.movieId, c]))
    const matching = recs.filter((r) => byId.get(r.movieId)!.genres.some((g) => wanted.includes(g))).length
    console.log(`     ${label}: ${matching}/10 in {${wanted.join(", ")}}`)
    for (const r of recs.slice(0, 5)) {
      const mv = byId.get(r.movieId)!
      const because = r.because.map((id) => byId.get(id)?.title).filter(Boolean).join(", ")
      console.log(`        ${mv.title} (${mv.year}) [${mv.genres.join(", ")}] because: ${because}`)
    }
    ok(`${label} skews to ${wanted[0]}`, matching >= 5, `${matching}/10`)
  }

  run(["The Matrix", "Blade Runner", "Alien", "Terminator 2", "Interstellar"], ["Sci-Fi", "Action"], "sci-fi profile")
  run(["Sleepless in Seattle", "Notting Hill", "Pretty Woman", "Four Weddings", "You've Got Mail"], ["Romance", "Comedy"], "romcom profile")
}

// ---------------------------------------------------------------------------
// 5. Degenerate inputs must not crash or produce nonsense.
// ---------------------------------------------------------------------------
function degenerate(catalog: CatalogMovie[], nb: ItemNeighbors, meta: DatasetMeta) {
  console.log("\n5. Degenerate cases")

  ok("no ratings returns nothing", recommend([], [], nb, catalog).length === 0)

  const lowRated = catalog.slice(0, 5).map((mv) => ({ movieId: mv.movieId, rating: 0.5, ratedAt: "" }))
  ok("below-threshold ratings contribute no signal", !hasUsableNeighbors(lowRated, nb, catalog))
  ok("below-threshold ratings recommend nothing", recommend(lowRated, [], nb, catalog).length === 0)

  const engineMovies = catalog.filter((m) => m.ratingCount >= meta.recommendableMinRatings)
  const everything = catalog.map((mv) => ({ movieId: mv.movieId, rating: 4.5, ratedAt: "" }))
  let threw = false
  let allRated: unknown[] = []
  try {
    allRated = recommend(everything, [], nb, catalog, { minRatingCount: meta.recommendableMinRatings })
  } catch {
    threw = true
  }
  ok("rating the entire catalogue returns empty, not a crash", !threw && allRated.length === 0)

  const obscure = [{ movieId: catalog[catalog.length - 1].movieId, rating: 5, ratedAt: "" }]
  let obscureThrew = false
  let obscureRecs: unknown[] = []
  try {
    obscureRecs = recommend(obscure, [], nb, catalog)
  } catch {
    obscureThrew = true
  }
  ok("a single obscure (non-engine) rating does not crash", !obscureThrew)

  const skipped = engineMovies.slice(0, 20).map((mv) => mv.movieId)
  const withSkips = recommend(
    engineMovies.slice(20, 26).map((mv) => ({ movieId: mv.movieId, rating: 5, ratedAt: "" })),
    skipped,
    nb,
    catalog,
    { minRatingCount: meta.recommendableMinRatings },
  )
  ok("skipped films stay out of the results", withSkips.every((r) => !skipped.includes(r.movieId)))

  const rated = engineMovies.slice(30, 40).map((mv) => ({ movieId: mv.movieId, rating: 4.5, ratedAt: "" }))
  const page1 = recommend(rated, [], nb, catalog, { offset: 0, minRatingCount: meta.recommendableMinRatings })
  const page2 = recommend(rated, [], nb, catalog, { offset: 1, minRatingCount: meta.recommendableMinRatings })
  ok(
    "Refresh returns a different page",
    page1.length > 0 && page2.length > 0 && page1[0].movieId !== page2[0].movieId,
  )
}

async function main() {
  const { catalog, nb, meta } = load()
  console.log(`\nDataset: ${fmtN(catalog.length)} catalogue movies, ${fmtN(meta.engineItemCount)} engine items, k=${nb.k}`)
  console.log(`Built ${meta.builtAt}`)

  await goldenTest(catalog, nb, meta)
  const users = await holdOut(catalog, nb, meta)
  diversityCheck(catalog, nb, meta, users)
  genreCoherence(catalog, nb, meta)
  degenerate(catalog, nb, meta)

  console.log(failures === 0 ? "\nAll checks passed.\n" : `\n${failures} check(s) failed.\n`)
  process.exit(failures === 0 ? 0 : 1)
}

function fmtN(n: number) {
  return n.toLocaleString("en-US")
}

main()
