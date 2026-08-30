/** Shared types for the recommender. No runtime code, no imports. */

export interface CatalogMovie {
  /** Position in the catalogue, and the column index into the ratings matrix. */
  index: number
  /** The MovieLens movieId - the stable identifier everything else keys on. */
  movieId: number
  title: string
  /** "(a.k.a. ...)" variants, kept searchable but not displayed. */
  altTitles: string[]
  year: number
  genres: string[]
  /** Zero-padded IMDb id as a string, e.g. "0114709". Never a number. */
  imdbId: string
  tmdbId: number | null
  /** Bare TMDB path, e.g. "/abc.jpg". Size is chosen at render time. */
  posterPath: string | null
  overview: string
  ratingCount: number
  meanRating: number
}

export interface RatingsMatrix {
  userCount: number
  movieCount: number
  /** Catalogue index -> MovieLens movieId. */
  movieIds: Uint32Array
  userIds: Int32Array
  /** L2 norm over each user's complete rating history, not just the catalogue. */
  fullNorm: Float32Array
  userMean: Float32Array
  rowPtr: Uint32Array
  /** Catalogue indices, strictly ascending within each row. */
  colIdx: Uint16Array
  /** Rating * 2, so 1..10 means 0.5..5 stars. */
  values: Uint8Array
  indexOfMovieId: Map<number, number>
}

export interface DatasetMeta {
  schemaVersion: number
  builtAt: string
  ratingsFile: string
  userCount: number
  movieCount: number
  nnz: number
  minYear: number
  catalogMinRatings: number
  recommendableMinRatings: number
  /** MovieLens ids for the one-at-a-time rating queue, most-rated first. */
  discoverPool: number[]
  posterBase: string
  source: string
}

export interface UserRating {
  movieId: number
  rating: number
  ratedAt: string
}

/** The visitor's ratings as a sparse vector over catalogue indices. */
export interface UserVector {
  idx: Uint16Array
  val: Float32Array
  norm: number
  mean: number
}

export interface Recommendation {
  movieId: number
  /** Ranking score: the predicted rating, shrunk toward zero by weak support. */
  score: number
  /** Predicted rating on the 0.5-5 scale, for display. */
  predicted: number
  /** How many neighbours actually rated this film. */
  support: number
  /** Row indices of the strongest contributing neighbours, for a "why?" affordance. */
  topNeighbors: number[]
}

export interface RecommendOptions {
  /** Neighbourhood size. */
  k?: number
  count?: number
  /** Minimum co-rated films before a neighbour is trusted at all. */
  minOverlap?: number
  /** Demotes items backed by very few neighbours. */
  shrinkage?: number
  /** A film needs this many MovieLens ratings before it may be recommended. */
  minRatingCount?: number
  /** Page offset, so the Refresh button can show 11-20 rather than the same ten. */
  offset?: number
}

export const DEFAULT_OPTIONS: Required<Omit<RecommendOptions, "offset">> & { offset: number } = {
  k: 30,
  count: 10,
  minOverlap: 2,
  shrinkage: 5,
  minRatingCount: 20,
  offset: 0,
}

/** Ratings needed before personalised results are shown at all. */
export const MIN_RATINGS_FOR_CF = 5
/** What the original Java app asked for, and what we nudge toward. */
export const IDEAL_RATINGS = 10
