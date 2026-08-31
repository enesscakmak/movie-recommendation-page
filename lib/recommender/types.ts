/** Shared types for the recommender. No runtime code, no imports. */

export interface CatalogMovie {
  /** Position in the catalogue, and the index into the neighbour table. */
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
  ratingCount: number
  meanRating: number
}

/**
 * Item-item similarity, trained offline on the full MovieLens rating
 * population. Row layout is fixed-width: movie `i`'s neighbours are always at
 * `[i*k, i*k+k)` in both arrays, so there is no rowPtr to walk.
 *
 * Movies below the recommendable threshold have an all-empty row (every slot
 * 0xFFFF) - see scripts/build-dataset.mjs.
 */
export interface ItemNeighbors {
  movieCount: number
  k: number
  /** Catalogue index per slot, or 0xFFFF for an empty slot. */
  neighborIdx: Uint16Array
  /** Similarity per slot, quantised 0..65535 for 0.0..1.0. */
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

export interface Recommendation {
  movieId: number
  /** Ranking score after diversity re-ranking - not a calibrated star value. */
  score: number
  /** How many of the visitor's own rated films voted for this one. */
  support: number
  /** movieIds of the visitor's own rated films that drove this pick most, for a "because you liked..." line. */
  because: number[]
}

/** One entry from a single film's stored top-K neighbour row - see `similarTo`. */
export interface SimilarMovie {
  movieId: number
  /** 0..1, straight from the stored table - not comparable across different source films. */
  similarity: number
}

export interface RecommendOptions {
  count?: number
  /** A rated film below this many stars contributes no signal (see LIKE_THRESHOLD in itemitem.mjs). */
  likeThreshold?: number
  /** Raw candidates considered before diversity re-ranking narrows to `count`. */
  candidatePool?: number
  /** MMR trade-off: 0 = pure relevance ranking, higher values push harder against picking near-duplicates of what's already chosen. */
  diversity?: number
  /** A film needs this many MovieLens ratings before it may be recommended. */
  minRatingCount?: number
  /** Page offset, so the Refresh button can show a different ten rather than the same ones. */
  offset?: number
}

export const DEFAULT_OPTIONS: Required<Omit<RecommendOptions, "offset">> & { offset: number } = {
  count: 10,
  likeThreshold: 4.0,
  candidatePool: 200,
  diversity: 0.5,
  minRatingCount: 100,
  offset: 0,
}

/** Ratings needed before personalised results are shown at all. */
export const MIN_RATINGS_FOR_CF = 5
/** What the original Java app asked for, and what we nudge toward. */
export const IDEAL_RATINGS = 10
