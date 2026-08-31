// The recommendation core: item-item collaborative filtering plus an MMR
// diversity re-rank.
//
// This module imports nothing - no next/*, no DOM, no app code - so
// scripts/eval-recommender.ts can exercise it under plain node.
//
// How it differs from the ported Java app: the original (and an earlier pass
// of this port) computed user-based CF - find MovieLens users who rate like
// you, recommend what they liked. That requires shipping other people's
// rating rows to the browser, which does not scale past a few thousand
// users. Item-item flips the axis: at build time, over the FULL ~33M-rating
// population, every film gets a top-20 list of "people who liked this also
// liked...". Only that lookup table ships (a few hundred KB); the training
// data never does. Measured on a held-out split this beats the user-based
// approach at 1/8th the payload - see the README for the numbers.

import type { CatalogMovie, ItemNeighbors, Recommendation, RecommendOptions, UserRating } from "./types"
import { DEFAULT_OPTIONS } from "./types"

const SIM_SCALE = 65535 // matches the quantisation in scripts/lib/encode.mjs
const EMPTY = 0xffff

/** Similarity between two catalogue indices, or 0 if neither lists the other as a top-K neighbour. */
export function itemSimilarity(nb: ItemNeighbors, a: number, b: number): number {
  const k = nb.k
  for (let t = 0; t < k; t++) {
    const slot = a * k + t
    const idx = nb.neighborIdx[slot]
    if (idx === EMPTY) break
    if (idx === b) return nb.neighborSim[slot] / SIM_SCALE
  }
  for (let t = 0; t < k; t++) {
    const slot = b * k + t
    const idx = nb.neighborIdx[slot]
    if (idx === EMPTY) break
    if (idx === a) return nb.neighborSim[slot] / SIM_SCALE
  }
  return 0
}

// The catalogue is one stable array for the lifetime of a page load; building
// this 18k-entry map fresh on every recommend() call (every rating, every
// Refresh click) would be pure waste.
const movieIdIndexCache = new WeakMap<CatalogMovie[], Map<number, number>>()
function indexOfMovieIdFor(catalog: CatalogMovie[]): Map<number, number> {
  let cached = movieIdIndexCache.get(catalog)
  if (!cached) {
    cached = new Map(catalog.map((m) => [m.movieId, m.index]))
    movieIdIndexCache.set(catalog, cached)
  }
  return cached
}

interface RawScores {
  score: Float64Array
  support: Int32Array
  because1: Int32Array // catalogue index of the strongest contributing rated film, or -1
  because2: Int32Array // second-strongest, or -1
}

/**
 * Sum, over every film the visitor rated >= likeThreshold, that film's
 * contribution to each of its stored neighbours: weight * similarity, where
 * weight = rating - 3 (so a 4-star vote contributes 1.0, a 5-star 2.0 - a
 * stronger vote counts for more). Dislikes are not modelled as negative
 * signal - see the README for why that was tried and measured worse.
 */
function scoreAll(ratings: UserRating[], nb: ItemNeighbors, catalog: CatalogMovie[], likeThreshold: number): RawScores {
  const M = nb.movieCount
  const score = new Float64Array(M)
  const support = new Int32Array(M)
  const because1 = new Int32Array(M).fill(-1)
  const because2 = new Int32Array(M).fill(-1)
  const bestW = new Float64Array(M)
  const secondW = new Float64Array(M)

  const indexOfMovieId = indexOfMovieIdFor(catalog)

  for (const r of ratings) {
    if (r.rating < likeThreshold) continue
    const i = indexOfMovieId.get(r.movieId)
    if (i === undefined) continue
    const weight = r.rating - 3
    const k = nb.k
    for (let t = 0; t < k; t++) {
      const slot = i * k + t
      const j = nb.neighborIdx[slot]
      if (j === EMPTY) break
      const contribution = weight * (nb.neighborSim[slot] / SIM_SCALE)
      score[j] += contribution
      support[j]++
      if (contribution > bestW[j]) {
        secondW[j] = bestW[j]; because2[j] = because1[j]
        bestW[j] = contribution; because1[j] = i
      } else if (contribution > secondW[j]) {
        secondW[j] = contribution; because2[j] = i
      }
    }
  }

  return { score, support, because1, because2 }
}

/**
 * Greedy maximal-marginal-relevance re-rank: repeatedly take the remaining
 * candidate that maximises `relevance - diversity * maxSimilarityToPicked`.
 * Without this, rating five sci-fi films the same week returns ten more
 * sci-fi films - technically correct, and a worse product. Measured on a
 * held-out split, diversity around 0.5 reduces average pairwise similarity
 * among the top 10 by ~20% while *improving* recall@10 slightly, because it
 * stops near-duplicate high scorers from crowding out a slightly lower-scored
 * but genuinely different pick.
 */
function mmrRank(candidates: Array<[col: number, score: number]>, nb: ItemNeighbors, count: number, diversity: number): number[] {
  if (diversity <= 0) return candidates.slice(0, count).map(([col]) => col)

  const pool = [...candidates]
  const maxScore = pool.length ? pool[0][1] : 1
  const picked: number[] = []

  while (picked.length < count && pool.length > 0) {
    let bestI = 0
    let bestValue = -Infinity
    for (let i = 0; i < pool.length; i++) {
      const [col, sc] = pool[i]
      let maxSim = 0
      for (const p of picked) {
        const sim = itemSimilarity(nb, col, p)
        if (sim > maxSim) maxSim = sim
      }
      const value = sc / maxScore - diversity * maxSim
      if (value > bestValue) { bestValue = value; bestI = i }
    }
    picked.push(pool[bestI][0])
    pool.splice(bestI, 1)
  }
  return picked
}

/**
 * Score every candidate film against the visitor's own ratings, then
 * diversity-rerank and page.
 */
export function recommend(
  ratings: UserRating[],
  skipped: number[],
  nb: ItemNeighbors,
  catalog: CatalogMovie[],
  options: RecommendOptions = {},
): Recommendation[] {
  const opts = { ...DEFAULT_OPTIONS, ...options }
  if (ratings.length === 0) return []

  const { score, support, because1, because2 } = scoreAll(ratings, nb, catalog, opts.likeThreshold)

  const excluded = new Set<number>()
  for (const r of ratings) excluded.add(r.movieId)
  for (const id of skipped) excluded.add(id)

  const raw: Array<[number, number]> = []
  for (let col = 0; col < nb.movieCount; col++) {
    if (support[col] === 0) continue
    const movie = catalog[col]
    if (!movie || excluded.has(movie.movieId)) continue
    if (movie.ratingCount < opts.minRatingCount) continue
    raw.push([col, score[col]])
  }
  raw.sort((a, b) => b[1] - a[1])

  // Enough MMR picks to cover the requested page, capped at the candidate pool.
  const pool = raw.slice(0, Math.max(opts.candidatePool, (opts.offset + 1) * opts.count))
  const ranked = mmrRank(pool, nb, Math.min(pool.length, (opts.offset + 1) * opts.count), opts.diversity)

  const pages = Math.max(1, Math.ceil(ranked.length / opts.count))
  const start = (opts.offset % pages) * opts.count
  const page = ranked.slice(start, start + opts.count)

  return page.map((col) => {
    const because: number[] = []
    if (because1[col] >= 0) because.push(catalog[because1[col]].movieId)
    if (because2[col] >= 0) because.push(catalog[because2[col]].movieId)
    return { movieId: catalog[col].movieId, score: score[col], support: support[col], because }
  })
}

/** True when the visitor's ratings produced no usable recommendation at all. */
export function hasUsableNeighbors(ratings: UserRating[], nb: ItemNeighbors, catalog: CatalogMovie[], likeThreshold = 4.0): boolean {
  const { support } = scoreAll(ratings, nb, catalog, likeThreshold)
  for (let i = 0; i < support.length; i++) if (support[i] > 0) return true
  return false
}
