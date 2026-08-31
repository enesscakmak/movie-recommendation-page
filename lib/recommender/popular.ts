import type { CatalogMovie } from "./types"

const PRIOR_WEIGHT = 50

let cacheCatalog: CatalogMovie[] | null = null
let cacheMinRatings = -1
let cacheRanked: CatalogMovie[] = []

function rankedPopularity(catalog: CatalogMovie[], minRatings: number): CatalogMovie[] {
  if (cacheCatalog === catalog && cacheMinRatings === minRatings) return cacheRanked

  const eligible = catalog.filter((m) => m.ratingCount >= minRatings)
  let total = 0
  let n = 0
  for (const m of eligible) {
    total += m.meanRating * m.ratingCount
    n += m.ratingCount
  }
  const globalMean = n > 0 ? total / n : 3.5

  cacheCatalog = catalog
  cacheMinRatings = minRatings
  cacheRanked = eligible.sort((a, b) => bayesian(b, globalMean) - bayesian(a, globalMean))
  return cacheRanked
}

export function popularMovies(
  catalog: CatalogMovie[],
  {
    count = 10,
    minRatings = 20,
    excludeIds,
    offset = 0,
  }: { count?: number; minRatings?: number; excludeIds?: Set<number>; offset?: number } = {},
): CatalogMovie[] {
  const ranked = rankedPopularity(catalog, minRatings)
  const filtered = excludeIds ? ranked.filter((m) => !excludeIds.has(m.movieId)) : ranked
  if (filtered.length === 0) return []

  const pages = Math.max(1, Math.ceil(filtered.length / count))
  const start = (offset % pages) * count
  return filtered.slice(start, start + count)
}

function bayesian(m: CatalogMovie, globalMean: number): number {
  return (PRIOR_WEIGHT * globalMean + m.meanRating * m.ratingCount) / (PRIOR_WEIGHT + m.ratingCount)
}
