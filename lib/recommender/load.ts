import type { CatalogMovie, DatasetMeta, RatingsMatrix } from "./types"

const MAGIC = "MRC1"

/** Wire form of catalog.json - short keys, because it ships to every visitor. */
interface RawCatalogMovie {
  i: number
  m: number
  t: string
  alt: string[]
  y: number
  g: string[]
  im: string
  td: number | null
  p: string | null
  o: string
  n: number
  a: number
}

function expand(r: RawCatalogMovie): CatalogMovie {
  return {
    index: r.i,
    movieId: r.m,
    title: r.t,
    altTitles: r.alt ?? [],
    year: r.y,
    genres: r.g ?? [],
    imdbId: r.im,
    tmdbId: r.td,
    posterPath: r.p,
    overview: r.o ?? "",
    ratingCount: r.n,
    meanRating: r.a,
  }
}

/**
 * Decode ratings.bin into typed-array views over the downloaded buffer.
 * Nothing is copied and nothing is parsed - the views point straight into the
 * ArrayBuffer. See scripts/lib/encode.mjs for the layout.
 */
export function decodeMatrix(ab: ArrayBuffer): RatingsMatrix {
  const dv = new DataView(ab)
  const magic = String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3))
  if (magic !== MAGIC) throw new Error(`ratings.bin: bad magic ${JSON.stringify(magic)}`)

  const userCount = dv.getUint32(4, true)
  const movieCount = dv.getUint32(8, true)
  const nnz = dv.getUint32(12, true)

  let off = 16
  const movieIds = new Uint32Array(ab, off, movieCount); off += movieCount * 4
  const userIds = new Int32Array(ab, off, userCount); off += userCount * 4
  const fullNorm = new Float32Array(ab, off, userCount); off += userCount * 4
  const userMean = new Float32Array(ab, off, userCount); off += userCount * 4
  const rowPtr = new Uint32Array(ab, off, userCount + 1); off += (userCount + 1) * 4
  const colIdx = new Uint16Array(ab, off, nnz); off += nnz * 2
  const values = new Uint8Array(ab, off, nnz)

  const indexOfMovieId = new Map<number, number>()
  for (let i = 0; i < movieCount; i++) indexOfMovieId.set(movieIds[i], i)

  return { userCount, movieCount, movieIds, userIds, fullNorm, userMean, rowPtr, colIdx, values, indexOfMovieId }
}

// Module-level memoisation: every caller shares one fetch and one decode.
let catalogPromise: Promise<CatalogMovie[]> | null = null
let metaPromise: Promise<DatasetMeta> | null = null
let matrixPromise: Promise<RatingsMatrix> | null = null

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(path)
  if (!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`)
  return (await res.json()) as T
}

export function loadMeta(): Promise<DatasetMeta> {
  metaPromise ??= fetchJson<DatasetMeta>("/data/dataset-meta.json")
  return metaPromise
}

export function loadCatalog(): Promise<CatalogMovie[]> {
  catalogPromise ??= fetchJson<{ movies: RawCatalogMovie[] }>("/data/catalog.json").then((d) =>
    d.movies.map(expand),
  )
  return catalogPromise
}

/**
 * The ratings matrix, fetched lazily. Callers must not reach for this until
 * the visitor actually has enough ratings to personalise - it is ~150 KB that
 * most visitors never need on first paint.
 */
export function loadRatingsMatrix(): Promise<RatingsMatrix> {
  matrixPromise ??= (async () => {
    const meta = await loadMeta()
    const res = await fetch(`/data/${meta.ratingsFile}`)
    if (!res.ok) throw new Error(`Failed to load ${meta.ratingsFile}: ${res.status}`)
    return decodeMatrix(await res.arrayBuffer())
  })()
  return matrixPromise
}

export function posterUrl(posterPath: string | null, size: "w185" | "w342" | "w500" = "w342"): string | null {
  return posterPath ? `https://image.tmdb.org/t/p/${size}${posterPath}` : null
}

/** IMDb ids are zero-padded strings; rebuilding the URL must not lose that. */
export function imdbUrl(imdbId: string): string {
  return `https://www.imdb.com/title/tt${String(imdbId).padStart(7, "0")}/`
}
