import type { CatalogMovie, DiscoveryFilter } from "./types"

export function isFilterActive(filter: DiscoveryFilter): boolean {
  return (
    filter.genres.length > 0 ||
    filter.minYear !== undefined ||
    filter.maxYear !== undefined ||
    filter.minMeanRating !== undefined
  )
}

export function passesFilter(movie: CatalogMovie, filter: DiscoveryFilter): boolean {
  if (filter.genres.length > 0 && !filter.genres.some((g) => movie.genres.includes(g))) return false
  if (filter.minYear !== undefined && movie.year < filter.minYear) return false
  if (filter.maxYear !== undefined && movie.year > filter.maxYear) return false
  if (filter.minMeanRating !== undefined && movie.meanRating < filter.minMeanRating) return false
  return true
}

export function decadeOf(year: number): number {
  return Math.floor(year / 10) * 10
}

const genresCache = new WeakMap<CatalogMovie[], string[]>()

export function allGenres(catalog: CatalogMovie[]): string[] {
  let cached = genresCache.get(catalog)
  if (!cached) {
    const set = new Set<string>()
    for (const m of catalog) for (const g of m.genres) set.add(g)
    cached = Array.from(set).sort()
    genresCache.set(catalog, cached)
  }
  return cached
}

const decadesCache = new WeakMap<CatalogMovie[], number[]>()

export function allDecades(catalog: CatalogMovie[]): number[] {
  let cached = decadesCache.get(catalog)
  if (!cached) {
    const set = new Set<number>()
    for (const m of catalog) set.add(decadeOf(m.year))
    cached = Array.from(set).sort((a, b) => b - a)
    decadesCache.set(catalog, cached)
  }
  return cached
}
