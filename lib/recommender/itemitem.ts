
import type {
  CatalogMovie,
  ExplainedContribution,
  ItemNeighbors,
  Recommendation,
  RecommendOptions,
  SimilarMovie,
  UserRating,
} from "./types"
import { DEFAULT_OPTIONS } from "./types"
import { passesFilter } from "./filters"
import { popularMovies } from "./popular"

const SIM_SCALE = 65535
const EMPTY = 0xffff

function directedSimilarity(nb: ItemNeighbors, from: number, to: number): number {
  const k = nb.k
  for (let t = 0; t < k; t++) {
    const slot = from * k + t
    const idx = nb.neighborIdx[slot]
    if (idx === EMPTY) break
    if (idx === to) return nb.neighborSim[slot] / SIM_SCALE
  }
  return 0
}

export function itemSimilarity(nb: ItemNeighbors, a: number, b: number): number {
  const forward = directedSimilarity(nb, a, b)
  if (forward > 0) return forward
  return directedSimilarity(nb, b, a)
}

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
  because1: Int32Array
  because2: Int32Array
}

function scoreAll(
  ratings: UserRating[],
  nb: ItemNeighbors,
  catalog: CatalogMovie[],
  likeThreshold: number,
  dislikeThreshold: number,
): RawScores {
  const M = nb.movieCount
  const score = new Float64Array(M)
  const support = new Int32Array(M)
  const because1 = new Int32Array(M).fill(-1)
  const because2 = new Int32Array(M).fill(-1)
  const bestW = new Float64Array(M)
  const secondW = new Float64Array(M)

  const indexOfMovieId = indexOfMovieIdFor(catalog)

  for (const r of ratings) {
    if (r.rating < likeThreshold && r.rating > dislikeThreshold) continue
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

export function recommend(
  ratings: UserRating[],
  skipped: number[],
  nb: ItemNeighbors,
  catalog: CatalogMovie[],
  options: RecommendOptions = {},
): Recommendation[] {
  const opts = { ...DEFAULT_OPTIONS, ...options }
  if (ratings.length === 0) return []

  const { score, support, because1, because2 } = scoreAll(ratings, nb, catalog, opts.likeThreshold, opts.dislikeThreshold)

  let hasPositiveSignal = false
  for (let i = 0; i < support.length; i++) {
    if (support[i] > 0 && score[i] > 0) {
      hasPositiveSignal = true
      break
    }
  }

  const excluded = new Set<number>()
  for (const r of ratings) excluded.add(r.movieId)
  for (const id of skipped) excluded.add(id)

  const raw: Array<[number, number]> = []
  for (let col = 0; col < nb.movieCount; col++) {
    if (support[col] === 0) continue
    if (score[col] <= 0) continue
    const movie = catalog[col]
    if (!movie || excluded.has(movie.movieId)) continue
    if (movie.ratingCount < opts.minRatingCount) continue
    if (opts.filter && !passesFilter(movie, opts.filter)) continue
    raw.push([col, score[col]])
  }
  raw.sort((a, b) => b[1] - a[1])

  const pool = raw.slice(0, Math.max(opts.candidatePool, (opts.offset + 1) * opts.count))
  const ranked = mmrRank(pool, nb, Math.min(pool.length, (opts.offset + 1) * opts.count), opts.diversity)

  const pages = Math.max(1, Math.ceil(ranked.length / opts.count))
  const start = (opts.offset % pages) * opts.count
  const page = ranked.slice(start, start + opts.count)

  const results = page.map((col) => {
    const because: number[] = []
    if (because1[col] >= 0) because.push(catalog[because1[col]].movieId)
    if (because2[col] >= 0) because.push(catalog[because2[col]].movieId)
    return { movieId: catalog[col].movieId, score: score[col], support: support[col], because }
  })

  if (hasPositiveSignal && results.length < opts.count) {
    const backfillExclude = new Set(excluded)
    for (const r of results) backfillExclude.add(r.movieId)
    const backfill = popularMovies(catalog, {
      count: opts.count - results.length,
      minRatings: opts.minRatingCount,
      excludeIds: backfillExclude,
      filter: opts.filter,
      offset: opts.offset,
    })
    for (const movie of backfill) {
      results.push({ movieId: movie.movieId, score: 0, support: 0, because: [] })
    }
  }

  return results
}

export function similarTo(index: number, nb: ItemNeighbors, catalog: CatalogMovie[], count = 10): SimilarMovie[] {
  const k = nb.k
  const out: SimilarMovie[] = []
  for (let t = 0; t < k && out.length < count; t++) {
    const slot = index * k + t
    const idx = nb.neighborIdx[slot]
    if (idx === EMPTY) break
    const movie = catalog[idx]
    if (!movie) continue
    out.push({ movieId: movie.movieId, similarity: nb.neighborSim[slot] / SIM_SCALE })
  }
  return out
}

export function explain(
  targetIndex: number,
  ratings: UserRating[],
  nb: ItemNeighbors,
  catalog: CatalogMovie[],
  limit = 5,
): ExplainedContribution[] {
  const indexOfMovieId = indexOfMovieIdFor(catalog)
  const contributions: ExplainedContribution[] = []

  for (const r of ratings) {
    if (r.rating < DEFAULT_OPTIONS.likeThreshold && r.rating > DEFAULT_OPTIONS.dislikeThreshold) continue
    const sourceIndex = indexOfMovieId.get(r.movieId)
    if (sourceIndex === undefined) continue
    const similarity = directedSimilarity(nb, sourceIndex, targetIndex)
    if (similarity <= 0) continue
    const contribution = (r.rating - 3) * similarity
    if (contribution <= 0) continue
    const source = catalog[sourceIndex]
    contributions.push({ movieId: r.movieId, title: source.title, rating: r.rating, similarity, contribution })
  }

  contributions.sort((a, b) => b.contribution - a.contribution)
  return contributions.slice(0, limit)
}

export function hasUsableNeighbors(
  ratings: UserRating[],
  nb: ItemNeighbors,
  catalog: CatalogMovie[],
  likeThreshold = 4.0,
  dislikeThreshold = 2.0,
): boolean {
  const { score, support } = scoreAll(ratings, nb, catalog, likeThreshold, dislikeThreshold)
  for (let i = 0; i < support.length; i++) if (support[i] > 0 && score[i] > 0) return true
  return false
}
