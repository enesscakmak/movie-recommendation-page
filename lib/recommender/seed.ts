import type { CatalogMovie } from "./types"
import { decadeOf } from "./filters"
import { popularMovies } from "./popular"

export function seedDeck(
  catalog: CatalogMovie[],
  discoverPool: number[],
  exclude: Set<number>,
  count = 20,
): CatalogMovie[] {
  const byId = new Map(catalog.map((m) => [m.movieId, m]))
  const candidates = discoverPool
    .map((id) => byId.get(id))
    .filter((m): m is CatalogMovie => m !== undefined && !exclude.has(m.movieId))

  const seenGenres = new Set<string>()
  const seenDecades = new Set<number>()
  const picked: CatalogMovie[] = []
  const remaining = [...candidates]

  while (picked.length < count && remaining.length > 0) {
    let bestIdx = 0
    let bestScore = -1
    for (let i = 0; i < remaining.length; i++) {
      const movie = remaining[i]
      let score = 0
      for (const g of movie.genres) if (!seenGenres.has(g)) score++
      if (!seenDecades.has(decadeOf(movie.year))) score++
      if (score > bestScore) {
        bestScore = score
        bestIdx = i
      }
    }
    const movie = remaining[bestIdx]
    picked.push(movie)
    remaining.splice(bestIdx, 1)
    for (const g of movie.genres) seenGenres.add(g)
    seenDecades.add(decadeOf(movie.year))
  }

  if (picked.length < count) {
    const pickedIds = new Set(picked.map((m) => m.movieId))
    const backfillExclude = new Set([...exclude, ...pickedIds])
    const backfill = popularMovies(catalog, { count: count - picked.length, excludeIds: backfillExclude })
    picked.push(...backfill)
  }

  return picked
}
