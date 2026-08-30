import type { CatalogMovie } from "./types"

/**
 * Bayesian-mean popularity, used before a visitor has rated enough to
 * personalise anything.
 *
 *   score = (C·m + Σr) / (C + n)
 *
 * where m is the global mean and C is the weight given to it. A film with four
 * ratings averaging 5.0 gets pulled back toward the global mean; a film with
 * four hundred barely moves. Without this, the top of the list is whatever
 * obscure title happened to get three enthusiastic ratings.
 */
const PRIOR_WEIGHT = 50

export function popularMovies(
  catalog: CatalogMovie[],
  {
    count = 10,
    minRatings = 20,
    excludeIds,
    offset = 0,
  }: { count?: number; minRatings?: number; excludeIds?: Set<number>; offset?: number } = {},
): CatalogMovie[] {
  const eligible = catalog.filter(
    (m) => m.ratingCount >= minRatings && !(excludeIds && excludeIds.has(m.movieId)),
  )
  if (eligible.length === 0) return []

  let total = 0
  let n = 0
  for (const m of eligible) {
    total += m.meanRating * m.ratingCount
    n += m.ratingCount
  }
  const globalMean = n > 0 ? total / n : 3.5

  const ranked = [...eligible].sort((a, b) => bayesian(b, globalMean) - bayesian(a, globalMean))

  const pages = Math.max(1, Math.ceil(ranked.length / count))
  const start = (offset % pages) * count
  return ranked.slice(start, start + count)
}

function bayesian(m: CatalogMovie, globalMean: number): number {
  return (PRIOR_WEIGHT * globalMean + m.meanRating * m.ratingCount) / (PRIOR_WEIGHT + m.ratingCount)
}
