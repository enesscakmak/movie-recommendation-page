import type { CatalogMovie } from "./types"

const PRIOR_WEIGHT = 50

// Curated first-run lineup for visitors with no ratings yet, in display order.
// Falls back to the popularity ranking below once these run out or get rated/skipped.
export const CURATED_HOME_IDS: number[] = [
  8961, // The Incredibles
  106782, // The Wolf of Wall Street
  58559, // The Dark Knight
  4993, // The Lord of the Rings: The Fellowship of the Ring
  527, // Schindler's List
  296, // Pulp Fiction
  356, // Forrest Gump
  1682, // The Truman Show
  2959, // Fight Club
  2571, // The Matrix
  1210, // Star Wars: Episode VI - Return of the Jedi (earliest Star Wars film in the catalog)
]

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
    curatedIds,
  }: {
    count?: number
    minRatings?: number
    excludeIds?: Set<number>
    offset?: number
    curatedIds?: number[]
  } = {},
): CatalogMovie[] {
  const ranked = rankedPopularity(catalog, minRatings)

  if (curatedIds) {
    const byId = new Map(catalog.map((m) => [m.movieId, m]))
    const picked: CatalogMovie[] = []
    const seen = new Set<number>()
    for (const id of curatedIds) {
      if (excludeIds?.has(id)) continue
      const movie = byId.get(id)
      if (!movie) continue
      picked.push(movie)
      seen.add(id)
    }
    for (const movie of ranked) {
      if (picked.length >= count) break
      if (seen.has(movie.movieId) || excludeIds?.has(movie.movieId)) continue
      picked.push(movie)
    }
    return picked.slice(0, count)
  }

  const filtered = excludeIds ? ranked.filter((m) => !excludeIds.has(m.movieId)) : ranked
  if (filtered.length === 0) return []

  const pages = Math.max(1, Math.ceil(filtered.length / count))
  const start = (offset % pages) * count
  return filtered.slice(start, start + count)
}

function bayesian(m: CatalogMovie, globalMean: number): number {
  return (PRIOR_WEIGHT * globalMean + m.meanRating * m.ratingCount) / (PRIOR_WEIGHT + m.ratingCount)
}
