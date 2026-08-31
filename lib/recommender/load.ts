import type { CatalogMovie, DatasetMeta, ItemNeighbors } from "./types"

const MAGIC = "MIN1"

/** Wire form of catalog.json - short keys, because it ships to every visitor. */
export interface RawCatalogMovie {
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

/** Exported so the offline eval harness can read catalog.json off disk. */
export function expandCatalog(raw: { movies: RawCatalogMovie[] }): CatalogMovie[] {
  return raw.movies.map(expand)
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
 * Decode itemnb.bin into typed-array views over the downloaded buffer.
 * Nothing is copied and nothing is parsed - the views point straight into the
 * ArrayBuffer. See scripts/lib/encode.mjs for the layout.
 */
export function decodeNeighborTable(ab: ArrayBuffer): ItemNeighbors {
  const dv = new DataView(ab)
  const magic = String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3))
  if (magic !== MAGIC) throw new Error(`itemnb.bin: bad magic ${JSON.stringify(magic)}`)

  const movieCount = dv.getUint32(4, true)
  const k = dv.getUint32(8, true)
  let off = 12
  const n = movieCount * k
  const neighborIdx = new Uint16Array(ab, off, n); off += n * 2
  const neighborSim = new Uint16Array(ab, off, n)

  return { movieCount, k, neighborIdx, neighborSim }
}

// Module-level memoisation: every caller shares one fetch and one decode.
let catalogPromise: Promise<CatalogMovie[]> | null = null
let metaPromise: Promise<DatasetMeta> | null = null
let neighborsPromise: Promise<ItemNeighbors> | null = null

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
  catalogPromise ??= fetchJson<{ movies: RawCatalogMovie[] }>("/data/catalog.json").then(expandCatalog)
  return catalogPromise
}

/**
 * The item-item neighbour table, fetched lazily. Callers must not reach for
 * this until the visitor actually has enough ratings to personalise - it is
 * a couple hundred KB that most visitors never need on first paint.
 */
export function loadNeighborTable(): Promise<ItemNeighbors> {
  neighborsPromise ??= (async () => {
    const meta = await loadMeta()
    const res = await fetch(`/data/${meta.neighborsFile}`)
    if (!res.ok) throw new Error(`Failed to load ${meta.neighborsFile}: ${res.status}`)
    return decodeNeighborTable(await res.arrayBuffer())
  })()
  return neighborsPromise
}

export function posterUrl(posterPath: string | null, size: "w185" | "w342" | "w500" = "w342"): string | null {
  return posterPath ? `https://image.tmdb.org/t/p/${size}${posterPath}` : null
}

/** IMDb ids are zero-padded strings; rebuilding the URL must not lose that. */
export function imdbUrl(imdbId: string): string {
  return `https://www.imdb.com/title/tt${String(imdbId).padStart(7, "0")}/`
}
