import { buildUserVector, similarities, topNeighbors } from "./cosine"
import { DEFAULT_OPTIONS } from "./types"
import type {
  CatalogMovie,
  RatingsMatrix,
  Recommendation,
  RecommendOptions,
  UserRating,
} from "./types"

/**
 * Score every candidate film against the visitor's neighbourhood.
 *
 * This is where the port deliberately diverges from the Java original.
 * `generateRecommendations` there sorted neighbours by similarity and then
 * emitted every film the single best neighbour had rated - half-star ratings
 * included - until it had ten. That is a bug rather than a design: it ignores
 * both how much the neighbour liked the film and whether anyone else agreed.
 *
 * The replacement is standard similarity-weighted aggregation over the top-k
 * neighbourhood:
 *
 *   predicted = visitorMean + Σ sim·(r − neighbourMean) / Σ |sim|
 *   score     = predicted · support / (support + shrinkage)
 *
 * Mean-centring here (rather than inside the similarity) corrects for harsh
 * versus generous raters using each neighbour's full history, which costs
 * nothing statistically. The shrinkage term stops a lone five-star from the
 * top neighbour outranking a twenty-neighbour consensus.
 */
export function recommend(
  ratings: UserRating[],
  skipped: number[],
  m: RatingsMatrix,
  catalog: CatalogMovie[],
  options: RecommendOptions = {},
): Recommendation[] {
  const opts = { ...DEFAULT_OPTIONS, ...options }

  const vec = buildUserVector(ratings, m)
  if (vec.idx.length === 0) return []

  const sims = similarities(vec, m, opts.minOverlap)
  const neighbors = topNeighbors(sims, opts.k)
  if (neighbors.length === 0) return []

  const excluded = new Set<number>()
  for (const r of ratings) if (r.rating > 0) excluded.add(r.movieId)
  // The original added skipped films to alreadyRatedMovies, so excluding
  // "haven't seen it" here is faithful: don't push back what was waved off.
  for (const id of skipped) excluded.add(id)

  const num = new Float64Array(m.movieCount)
  const den = new Float64Array(m.movieCount)
  const support = new Int32Array(m.movieCount)
  // Best contributing neighbour per film, for the "because you liked..." line.
  const best = new Int32Array(m.movieCount).fill(-1)
  const bestSim = new Float64Array(m.movieCount)

  for (const u of neighbors) {
    const sim = sims[u]
    const mean = m.userMean[u]
    for (let i = m.rowPtr[u]; i < m.rowPtr[u + 1]; i++) {
      const col = m.colIdx[i]
      num[col] += sim * (m.values[i] / 2 - mean)
      den[col] += sim
      support[col]++
      if (sim > bestSim[col]) {
        bestSim[col] = sim
        best[col] = u
      }
    }
  }

  const scored: Recommendation[] = []
  for (let col = 0; col < m.movieCount; col++) {
    if (support[col] === 0 || den[col] <= 0) continue

    const movie = catalog[col]
    if (!movie || excluded.has(movie.movieId)) continue
    if (movie.ratingCount < opts.minRatingCount) continue

    const predicted = vec.mean + num[col] / den[col]
    scored.push({
      movieId: movie.movieId,
      predicted: Math.max(0.5, Math.min(5, predicted)),
      score: predicted * (support[col] / (support[col] + opts.shrinkage)),
      support: support[col],
      topNeighbors: best[col] >= 0 ? [best[col]] : [],
    })
  }

  scored.sort((a, b) => b.score - a.score || b.support - a.support)

  // Refresh pages through the ranking rather than recomputing an identical
  // list. Wrap around instead of running dry.
  const pageSize = opts.count
  const pages = Math.max(1, Math.ceil(scored.length / pageSize))
  const start = (opts.offset % pages) * pageSize
  return scored.slice(start, start + pageSize)
}

/** True when the visitor's ratings produced no usable neighbour at all. */
export function hasUsableNeighbors(ratings: UserRating[], m: RatingsMatrix, minOverlap = 2): boolean {
  const vec = buildUserVector(ratings, m)
  if (vec.idx.length === 0) return false
  const sims = similarities(vec, m, minOverlap)
  for (let i = 0; i < sims.length; i++) if (sims[i] > 0) return true
  return false
}
