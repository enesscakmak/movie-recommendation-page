#!/usr/bin/env node

import { createHash } from "node:crypto"
import { gzipSync } from "node:zlib"
import { mkdirSync, writeFileSync, readdirSync, rmSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"

import {
  EXPECTED,
  MIN_YEAR,
  loadMovies,
  computeMovieStats,
  buildCatalog,
  ratingCountHistogram,
} from "./lib/movielens.mjs"
import { buildNeighborTable } from "./lib/itemitem.mjs"
import { fetchDetails } from "./lib/tmdb.mjs"
import { encodeNeighborTable, decodeNeighborTable, assertNeighborTableInvariants } from "./lib/encode.mjs"

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, "..")
const DATA_DIR = join(HERE, "data", "ml-latest-small")
const CACHE_DIR = join(HERE, ".cache", "tmdb")
const OUT_DIR = join(ROOT, "public", "data")

const CATALOG_MIN_RATINGS = 20
const RECOMMENDABLE_MIN_RATINGS = 100
const DISCOVER_POOL = 300
const OVERVIEW_MAX = 200
const NEIGHBOR_K = 20
const NEIGHBOR_ALPHA = 0.5
const NEIGHBOR_SHRINK = 20

const args = new Set(process.argv.slice(2))
const REFRESH = args.has("--refresh")
const NO_TMDB = args.has("--no-tmdb")

const fmt = (n) => n.toLocaleString("en-US")
const kb = (n) => `${(n / 1024).toFixed(1)} KB`
const mb = (n) => `${(n / 1024 / 1024).toFixed(2)} MB`

function check(label, actual, expected) {
  const ok = actual === expected
  console.log(`  ${ok ? "OK  " : "FAIL"} ${label}: ${fmt(actual)}${ok ? "" : ` (expected ${fmt(expected)})`}`)
  if (!ok) {
    throw new Error(
      `${label} is ${fmt(actual)}, expected ${fmt(expected)}. ` +
        `This build targets ml-32m specifically - a different MovieLens release will not match.`,
    )
  }
}

async function main() {
  console.log("\nScanning ratings.csv (streamed - this is an 877 MB file, one pass)...")
  const { stats: mStats, totalRatings, userCount } = await computeMovieStats(DATA_DIR)

  console.log("\nDataset sanity:")
  check("users", userCount, EXPECTED.users)
  check("ratings", totalRatings, EXPECTED.ratings)

  const movies = loadMovies(DATA_DIR)
  check("movies", movies.length, EXPECTED.movies)

  console.log("\nRatings per movie (whole dataset):")
  for (const { atLeast, movies: n } of ratingCountHistogram(mStats)) {
    console.log(`  >= ${String(atLeast).padStart(3)} ratings: ${String(fmt(n)).padStart(6)} movies`)
  }

  const catalog = buildCatalog(movies, mStats, {
    minYear: MIN_YEAR,
    minRatingCount: CATALOG_MIN_RATINGS,
  })
  console.log(
    `\nCatalogue: ${fmt(catalog.length)} movies ` +
      `(year >= ${MIN_YEAR}, >= ${CATALOG_MIN_RATINGS} ratings)`,
  )

  for (const m of catalog) {
    if (!m.imdbId) throw new Error(`catalogue movie ${m.movieId} "${m.title}" has no imdbId`)
    if (!(m.year >= MIN_YEAR)) throw new Error(`catalogue movie ${m.movieId} has year ${m.year}`)
  }
  console.log(`  OK   every catalogue entry has an imdbId and a year >= ${MIN_YEAR}`)

  let details = new Map()
  if (NO_TMDB) {
    console.log("\nTMDB: skipped (--no-tmdb); posters will be null")
  } else {
    console.log(`\nTMDB: resolving ${fmt(catalog.length)} titles by id...`)
    const res = await fetchDetails(
      catalog.map((m) => m.tmdbId),
      {
        apiKey: process.env.TMDB_API_KEY,
        cacheDir: CACHE_DIR,
        refresh: REFRESH,
        onProgress: (done, total) => process.stdout.write(`\r  ${done}/${total}`),
      },
    )
    details = res.details
    console.log(`\r  ${fmt(res.fetched)} fetched, ${fmt(res.cached)} from cache`)
  }

  const withPoster = catalog.filter((m) => details.get(m.tmdbId)?.posterPath).length
  const coverage = catalog.length ? (withPoster / catalog.length) * 100 : 0
  console.log(`  poster coverage: ${coverage.toFixed(1)}% (${fmt(withPoster)}/${fmt(catalog.length)})`)
  if (!NO_TMDB && coverage < 90) {
    console.warn(`  WARN poster coverage below 90% - check for TMDB errors in ${CACHE_DIR}`)
  }

  const indexOfMovieId = new Map(catalog.map((m, i) => [m.movieId, i]))

  const engineColOfMovieId = new Map()
  const engineCatalogIndex = []
  catalog.forEach((m, i) => {
    if (m.ratingCount >= RECOMMENDABLE_MIN_RATINGS) {
      engineColOfMovieId.set(m.movieId, engineCatalogIndex.length)
      engineCatalogIndex.push(i)
    }
  })
  console.log(
    `\nEngine items (>= ${RECOMMENDABLE_MIN_RATINGS} ratings): ${fmt(engineCatalogIndex.length)} ` +
      `of ${fmt(catalog.length)} catalogue movies`,
  )

  console.log(
    `\nTraining item-item similarity on the full rating population ` +
      `(k=${NEIGHBOR_K}, alpha=${NEIGHBOR_ALPHA}, shrink=${NEIGHBOR_SHRINK})...`,
  )
  const trained = await buildNeighborTable(DATA_DIR, engineColOfMovieId, engineCatalogIndex.length, {
    k: NEIGHBOR_K,
    alpha: NEIGHBOR_ALPHA,
    shrink: NEIGHBOR_SHRINK,
    onProgress: (rows) => process.stdout.write(`\r  ${fmt(rows)} rows scanned`),
  })
  console.log(`\r  ${fmt(trained.ratingRowsScanned)} rows scanned, ${fmt(trained.likedUserCount)} users contributed a "liked" rating`)

  const M = catalog.length
  const neighborIdx = new Int32Array(M * NEIGHBOR_K).fill(-1)
  const neighborSim = new Float32Array(M * NEIGHBOR_K)
  for (let e = 0; e < engineCatalogIndex.length; e++) {
    const catRow = engineCatalogIndex[e]
    for (let t = 0; t < NEIGHBOR_K; t++) {
      const nb = trained.nbrIdx[e * NEIGHBOR_K + t]
      if (nb < 0) continue
      neighborIdx[catRow * NEIGHBOR_K + t] = engineCatalogIndex[nb]
      neighborSim[catRow * NEIGHBOR_K + t] = trained.nbrSim[e * NEIGHBOR_K + t]
    }
  }

  const buf = encodeNeighborTable({ movieCount: M, k: NEIGHBOR_K, neighborIdx, neighborSim })
  const decoded = decodeNeighborTable(buf)
  assertNeighborTableInvariants(decoded)
  console.log("  OK   binary invariants (no self-neighbours, empty slots zeroed, indices in range)")

  const withNeighbors = engineCatalogIndex.length
  console.log(`\nNeighbour table: ${fmt(M)} catalogue movies x ${NEIGHBOR_K} neighbours (${fmt(withNeighbors)} rows populated)`)

  mkdirSync(OUT_DIR, { recursive: true })
  for (const f of readdirSync(OUT_DIR)) {
    if (/^itemnb\..*\.bin$/.test(f) || /^ratings\..*\.bin$/.test(f)) rmSync(join(OUT_DIR, f))
  }

  const hash = createHash("sha256").update(buf).digest("hex").slice(0, 8)
  const binName = `itemnb.${hash}.bin`
  writeFileSync(join(OUT_DIR, binName), buf)

  const discoverIds = catalog.slice(0, DISCOVER_POOL).map((m) => m.movieId)
  const catalogJson = {
    schemaVersion: 3,
    movies: catalog.map((m, i) => {
      const d = details.get(m.tmdbId) ?? { posterPath: null, overview: "" }
      return {
        i,
        m: m.movieId,
        t: m.title,
        alt: m.altTitles,
        y: m.year,
        g: m.genres,
        im: m.imdbId,
        td: m.tmdbId,
        p: d.posterPath,
        n: m.ratingCount,
        a: Number(m.meanRating.toFixed(3)),
      }
    }),
  }
  const catalogBuf = Buffer.from(JSON.stringify(catalogJson))
  writeFileSync(join(OUT_DIR, "catalog.json"), catalogBuf)

  const overviewsJson = catalog.map((m) => {
    const overview = details.get(m.tmdbId)?.overview ?? ""
    return overview.length > OVERVIEW_MAX ? `${overview.slice(0, OVERVIEW_MAX - 1).trimEnd()}…` : overview
  })
  const overviewsBuf = Buffer.from(JSON.stringify(overviewsJson))
  writeFileSync(join(OUT_DIR, "overviews.json"), overviewsBuf)

  const meta = {
    schemaVersion: 3,
    builtAt: new Date().toISOString(),
    neighborsFile: binName,
    movieCount: M,
    engineItemCount: withNeighbors,
    neighborK: NEIGHBOR_K,
    minYear: MIN_YEAR,
    catalogMinRatings: CATALOG_MIN_RATINGS,
    recommendableMinRatings: RECOMMENDABLE_MIN_RATINGS,
    discoverPool: discoverIds,
    posterBase: "https://image.tmdb.org/t/p/",
    source: "MovieLens ml-32m (GroupLens); details from TMDB",
  }
  const metaBuf = Buffer.from(JSON.stringify(meta))
  writeFileSync(join(OUT_DIR, "dataset-meta.json"), metaBuf)

  console.log("\nWrote public/data:")
  for (const [name, b] of [["catalog.json", catalogBuf], ["overviews.json", overviewsBuf], [binName, buf], ["dataset-meta.json", metaBuf]]) {
    console.log(`  ${name.padEnd(24)} ${kb(b.length).padStart(10)} raw  ${kb(gzipSync(b).length).padStart(10)} gzip`)
  }

  const binGzip = gzipSync(buf).length
  if (binGzip > 3 * 1024 * 1024) {
    throw new Error(`${binName} gzips to ${mb(binGzip)} - over the 3 MB budget, something is off`)
  }
  console.log("\nDone.\n")
}

main().catch((err) => {
  console.error(`\nBuild failed: ${err.message}\n`)
  process.exit(1)
})
