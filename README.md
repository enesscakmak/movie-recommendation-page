# Movie Recommendation Page

A movie recommender that started as a school project and got rebuilt into something actually usable.

Rate a few movies, build a watchlist, and get recommendations based on your taste, with a short explanation of why each one was picked.

Live at [movie.enescakmak.net](https://movie.enescakmak.net)

## How it works

Recommendations are generated with item-item collaborative filtering over the [MovieLens](https://grouplens.org/datasets/movielens/) dataset (2023 25M snapshot). Ratings and watchlist data are stored per user, sign in with Google to save your progress across sessions.

## Stack

- Next.js (App Router) + React
- Cloudflare Workers / D1, deployed via OpenNext
- Auth.js with Google + D1 adapter
- Tailwind + Radix UI

## Running locally

```bash
pnpm install
pnpm dev
```

Rebuilding the recommendation dataset (requires the raw MovieLens files):

```bash
pnpm build:dataset
pnpm build:stats
```

Evaluating the recommender:

```bash
pnpm eval
```
