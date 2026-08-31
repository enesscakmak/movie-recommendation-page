
export interface CatalogMovie {
  index: number
  movieId: number
  title: string
  altTitles: string[]
  year: number
  genres: string[]
  imdbId: string
  tmdbId: number | null
  posterPath: string | null
  ratingCount: number
  meanRating: number
}

export interface ItemNeighbors {
  movieCount: number
  k: number
  neighborIdx: Uint16Array
  neighborSim: Uint16Array
}

export interface DatasetMeta {
  schemaVersion: number
  builtAt: string
  neighborsFile: string
  movieCount: number
  engineItemCount: number
  neighborK: number
  minYear: number
  catalogMinRatings: number
  recommendableMinRatings: number
  discoverPool: number[]
  posterBase: string
  source: string
}

export interface UserRating {
  movieId: number
  rating: number
  ratedAt: string
}

export interface Recommendation {
  movieId: number
  score: number
  support: number
  because: number[]
}

export interface SimilarMovie {
  movieId: number
  similarity: number
}

export interface RecommendOptions {
  count?: number
  likeThreshold?: number
  dislikeThreshold?: number
  candidatePool?: number
  diversity?: number
  minRatingCount?: number
  offset?: number
}

export const DEFAULT_OPTIONS: Required<Omit<RecommendOptions, "offset">> & { offset: number } = {
  count: 10,
  likeThreshold: 4.0,
  dislikeThreshold: 2.0,
  candidatePool: 200,
  diversity: 0.5,
  minRatingCount: 100,
  offset: 0,
}

export const MIN_RATINGS_FOR_CF = 5
export const IDEAL_RATINGS = 10
