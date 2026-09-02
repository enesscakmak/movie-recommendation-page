import { useEffect, useState } from "react"
import type { CatalogMovie, DatasetMeta, ItemNeighbors, PopulationStats } from "./types"

const MAGIC = "MIN1"

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
  n: number
  a: number
}

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
    ratingCount: r.n,
    meanRating: r.a,
  }
}

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

let catalogPromise: Promise<CatalogMovie[]> | null = null
let metaPromise: Promise<DatasetMeta> | null = null
let neighborsPromise: Promise<ItemNeighbors> | null = null
let overviewsPromise: Promise<string[]> | null = null
let populationPromise: Promise<PopulationStats> | null = null

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

export function loadNeighborTable(): Promise<ItemNeighbors> {
  neighborsPromise ??= (async () => {
    const meta = await loadMeta()
    const res = await fetch(`/data/${meta.neighborsFile}`)
    if (!res.ok) throw new Error(`Failed to load ${meta.neighborsFile}: ${res.status}`)
    return decodeNeighborTable(await res.arrayBuffer())
  })()
  return neighborsPromise
}

export function loadOverviews(): Promise<string[]> {
  overviewsPromise ??= fetchJson<string[]>("/data/overviews.json")
  return overviewsPromise
}

export function loadPopulation(): Promise<PopulationStats> {
  populationPromise ??= fetchJson<PopulationStats>("/data/population.json")
  return populationPromise
}

export function useOverview(index: number): string {
  const [overview, setOverview] = useState("")

  useEffect(() => {
    let cancelled = false
    loadOverviews().then((overviews) => {
      if (!cancelled) setOverview(overviews[index] ?? "")
    })
    return () => {
      cancelled = true
    }
  }, [index])

  return overview
}

export function posterUrl(posterPath: string | null, size: "w185" | "w342" | "w500" = "w342"): string | null {
  return posterPath ? `https://image.tmdb.org/t/p/${size}${posterPath}` : null
}

export function imdbUrl(imdbId: string): string {
  return `https://www.imdb.com/title/tt${String(imdbId).padStart(7, "0")}/`
}
