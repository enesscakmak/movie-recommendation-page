#!/usr/bin/env node
//
// Turns the raw MovieLens ml-latest-small CSVs into the two files the app
// ships: public/data/catalog.json and public/data/ratings.<hash>.bin.
//
//   pnpm build:dataset            # uses scripts/.cache/tmdb where possible
//   pnpm build:dataset -- --refresh   # ignore the TMDB cache
//   pnpm build:dataset -- --no-tmdb   # skip posters entirely (offline)
//
// Run it once and commit the output. It is deliberately NOT part of `next
// build`: the dataset never changes, and a network fetch in CI is a failure
// mode with no upside.

import { createHash } from "node:crypto"
import { gzipSync } from "node:zlib"
import { mkdirSync, writeFileSync, readdirSync, rmSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"

import {
  EXPECTED,
  MIN_YEAR,
  loadRaw,
  userStatsFull,
  movieStats,
  buildCatalog,
  ratingCountHistogram,
} from "./lib/movielens.mjs"
import { fetchDetails } from "./lib/tmdb.mjs"
import { encodeMatrix, decodeMatrix, assertMatrixInvariants } from "./lib/encode.mjs"

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, "..")
const DATA_DIR = join(HERE, "data", "ml-latest-small")
const CACHE_DIR = join(HERE, ".cache", "tmdb")
const OUT_DIR = join(ROOT, "public", "data")

const CATALOG_MIN_RATINGS = 10 // searchable and rateable
const RECOMMENDABLE_MIN_RATINGS = 20 // eligible to be recommended
const DISCOVER_POOL = 300 // the one-at-a-time rating queue
const OVERVIEW_MAX = 200 // the card clamps to three lines anyway

const args = new Set(process.argv.slice(2))
const REFRESH = args.has("--refresh")
const NO_TMDB = args.has("--no-tmdb")

const fmt = (n) => n.toLocaleString("en-US")
const kb = (n) => `${(n / 1024).toFixed(1)} KB`

function check(label, actual, expected) {
  const ok = actual === expected
  console.log(`  ${ok ? "OK  " : "FAIL"} ${label}: ${fmt(actual)}${ok ? "" : ` (expected ${fmt(expected)})`}`)
  if (!ok) {
    throw new Error(
      `${label} is ${fmt(actual)}, expected ${fmt(expected)}. ` +
        `If this is far larger, you downloaded ml-latest (33M ratings) instead of ml-latest-small.`,
    )
  }
}

async function main() {
  console.log("\nLoading ml-latest-small...")
  const { movies, ratings } = loadRaw(DATA_DIR)

  const uStats = userStatsFull(ratings)
  const mStats = movieStats(ratings)

  console.log("\nDataset sanity:")
  check("users", uStats.size, EXPECTED.users)
  check("ratings", ratings.length, EXPECTED.ratings)
  check("movies", movies.length, EXPECTED.movies)

  console.log("\nRatings per movie (whole dataset):")
  for (const { atLeast, movies: n } of ratingCountHistogram(mStats)) {
    console.log(`  >= ${String(atLeast).padStart(3)} ratings: ${String(fmt(n)).padStart(6)} movies`)
  }

  // ---- catalogue -----------------------------------------------------------
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

  // ---- TMDB ----------------------------------------------------------------
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
  if (!NO_TMDB && coverage < 97) {
    console.warn(`  WARN poster coverage below 97% - check for TMDB errors in ${CACHE_DIR}`)
  }

  // ---- ratings matrix ------------------------------------------------------
  const indexOfMovieId = new Map(catalog.map((m, i) => [m.movieId, i]))
  const userIds = [...uStats.keys()].sort((a, b) => a - b)
  const rowOfUser = new Map(userIds.map((id, i) => [id, i]))

  const rows = userIds.map(() => [])
  for (const { userId, movieId, rating } of ratings) {
    const col = indexOfMovieId.get(movieId)
    if (col === undefined) continue // outside the catalogue
    rows[rowOfUser.get(userId)].push([col, rating])
  }

  const buf = encodeMatrix({
    movieIds: catalog.map((m) => m.movieId),
    userIds,
    // Full-history norms and means - see the note in movielens.mjs.
    fullNorm: userIds.map((id) => uStats.get(id).norm),
    userMean: userIds.map((id) => uStats.get(id).mean),
    rows,
  })

  const decoded = decodeMatrix(buf)
  assertMatrixInvariants(decoded)
  for (let i = 0; i < catalog.length; i++) {
    if (decoded.movieIds[i] !== catalog[i].movieId) {
      throw new Error(`movieIds[${i}] does not match catalogue order`)
    }
  }
  console.log(
    `\nMatrix: ${fmt(decoded.userCount)} users x ${fmt(decoded.movieCount)} movies, ` +
      `${fmt(decoded.nnz)} ratings retained`,
  )
  console.log("  OK   binary invariants (rowPtr, ascending colIdx, value range, catalogue alignment)")

  // ---- write ---------------------------------------------------------------
  mkdirSync(OUT_DIR, { recursive: true })
  for (const f of readdirSync(OUT_DIR)) {
    if (/^ratings\..*\.bin$/.test(f)) rmSync(join(OUT_DIR, f))
  }

  const hash = createHash("sha256").update(buf).digest("hex").slice(0, 8)
  const binName = `ratings.${hash}.bin`
  writeFileSync(join(OUT_DIR, binName), buf)

  const discoverIds = catalog.slice(0, DISCOVER_POOL).map((m) => m.movieId)
  const catalogJson = {
    schemaVersion: 1,
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
        o: d.overview.length > OVERVIEW_MAX ? `${d.overview.slice(0, OVERVIEW_MAX - 1).trimEnd()}…` : d.overview,
        n: m.ratingCount,
        a: Number(m.meanRating.toFixed(3)),
      }
    }),
  }
  const catalogBuf = Buffer.from(JSON.stringify(catalogJson))
  writeFileSync(join(OUT_DIR, "catalog.json"), catalogBuf)

  const meta = {
    schemaVersion: 1,
    builtAt: new Date().toISOString(),
    ratingsFile: binName,
    userCount: decoded.userCount,
    movieCount: decoded.movieCount,
    nnz: decoded.nnz,
    minYear: MIN_YEAR,
    catalogMinRatings: CATALOG_MIN_RATINGS,
    recommendableMinRatings: RECOMMENDABLE_MIN_RATINGS,
    discoverPool: discoverIds,
    posterBase: "https://image.tmdb.org/t/p/",
    source: "MovieLens ml-latest-small (GroupLens); details from TMDB",
  }
  const metaBuf = Buffer.from(JSON.stringify(meta))
  writeFileSync(join(OUT_DIR, "dataset-meta.json"), metaBuf)

  console.log("\nWrote public/data:")
  for (const [name, b] of [["catalog.json", catalogBuf], [binName, buf], ["dataset-meta.json", metaBuf]]) {
    console.log(`  ${name.padEnd(24)} ${kb(b.length).padStart(10)} raw  ${kb(gzipSync(b).length).padStart(10)} gzip`)
  }

  const binGzip = gzipSync(buf).length
  if (binGzip > 250 * 1024) {
    throw new Error(`${binName} gzips to ${kb(binGzip)} - over the 250 KB budget, the filter did not apply`)
  }
  console.log("\nDone.\n")
}

main().catch((err) => {
  console.error(`\nBuild failed: ${err.message}\n`)
  process.exit(1)
})
