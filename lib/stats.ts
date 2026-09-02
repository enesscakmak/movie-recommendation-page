import type { CatalogMovie, PopulationStats } from "@/lib/recommender"
import { decadeOf } from "@/lib/recommender"

export interface RatedEntry {
  movie: CatalogMovie
  rating: number
  ratedAt: string
}

export function genreShares(entries: RatedEntry[]): Record<string, number> {
  const counts: Record<string, number> = {}
  let total = 0
  for (const e of entries) {
    for (const g of e.movie.genres) {
      counts[g] = (counts[g] ?? 0) + 1
      total++
    }
  }
  const shares: Record<string, number> = {}
  for (const [g, c] of Object.entries(counts)) shares[g] = total > 0 ? c / total : 0
  return shares
}

export function decadeCounts(entries: RatedEntry[]): Record<number, number> {
  const counts: Record<number, number> = {}
  for (const e of entries) {
    const d = decadeOf(e.movie.year)
    counts[d] = (counts[d] ?? 0) + 1
  }
  return counts
}

export function ratingHistogram(entries: RatedEntry[]): Array<{ rating: string; count: number }> {
  const buckets = new Map<number, number>()
  for (let r = 0.5; r <= 5; r += 0.5) buckets.set(r, 0)
  for (const e of entries) {
    buckets.set(e.rating, (buckets.get(e.rating) ?? 0) + 1)
  }
  return Array.from(buckets.entries())
    .sort(([a], [b]) => a - b)
    .map(([rating, count]) => ({ rating: rating.toFixed(1), count }))
}

export function activityByMonth(entries: RatedEntry[]): Array<{ month: string; count: number }> {
  const counts = new Map<string, number>()
  for (const e of entries) {
    const d = new Date(e.ratedAt)
    if (Number.isNaN(d.getTime())) continue
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return Array.from(counts.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, count]) => ({ month, count }))
}

export interface GenreGap {
  genre: string
  userShare: number
  populationShare: number
  ratio: number
}

export function biggestGenreGap(entries: RatedEntry[], population: PopulationStats, minUserCount = 2): GenreGap | null {
  const genreCounts: Record<string, number> = {}
  for (const e of entries) for (const g of e.movie.genres) genreCounts[g] = (genreCounts[g] ?? 0) + 1

  const userShares = genreShares(entries)

  let best: GenreGap | null = null
  for (const [genre, userShare] of Object.entries(userShares)) {
    if ((genreCounts[genre] ?? 0) < minUserCount) continue
    const populationShare = (population.genres[genre] ?? 0) / population.totalGenreWeight
    if (populationShare <= 0) continue
    const ratio = userShare / populationShare
    if (!best || ratio > best.ratio) best = { genre, userShare, populationShare, ratio }
  }
  return best
}
