// Public surface of the recommender. Import from here, not from the
// individual modules, so the internals stay free to move.
//
// A note for anyone tempted to move this into a Web Worker: don't. Similarity
// is ~64k float operations and aggregation touches at most thirty neighbour
// rows - the whole thing runs in single-digit milliseconds. A worker would add
// a structured clone of the matrix and a bundling wrinkle under
// `output: 'export'` in exchange for nothing measurable. The only slow part is
// the network fetch, which is already async.

export type {
  CatalogMovie,
  DatasetMeta,
  RatingsMatrix,
  Recommendation,
  RecommendOptions,
  UserRating,
  UserVector,
} from "./types"

export { DEFAULT_OPTIONS, MIN_RATINGS_FOR_CF, IDEAL_RATINGS } from "./types"

export { loadCatalog, loadMeta, loadRatingsMatrix, decodeMatrix, posterUrl, imdbUrl } from "./load"
export { buildUserVector, similarities, topNeighbors, lookupRating } from "./cosine"
export { recommend, hasUsableNeighbors } from "./recommend"
export { popularMovies } from "./popular"
