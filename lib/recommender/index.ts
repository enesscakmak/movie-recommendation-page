// Public surface of the recommender. Import from here, not from the
// individual modules, so the internals stay free to move.
//
// A note for anyone tempted to move this into a Web Worker: don't. Scoring is
// a few thousand float operations (visitor's rated films x k neighbours) and
// MMR re-ranking touches at most a couple hundred candidates - the whole
// thing runs in single-digit milliseconds. A worker would add a structured
// clone of the neighbour table and a bundling wrinkle under
// `output: 'export'` in exchange for nothing measurable. The only slow part
// is the network fetch, which is already async.

export type {
  CatalogMovie,
  DatasetMeta,
  ItemNeighbors,
  Recommendation,
  RecommendOptions,
  UserRating,
} from "./types"

export { DEFAULT_OPTIONS, MIN_RATINGS_FOR_CF, IDEAL_RATINGS } from "./types"

export { loadCatalog, loadMeta, loadNeighborTable, decodeNeighborTable, posterUrl, imdbUrl } from "./load"
export { itemSimilarity, recommend, hasUsableNeighbors } from "./itemitem"
export { popularMovies } from "./popular"
