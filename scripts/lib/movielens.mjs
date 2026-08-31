// Parsing and filtering for the MovieLens ml-32m dataset.
//
// The dataset ships three files we care about:
//   movies.csv   movieId,title,genres          title carries a "(YYYY)" suffix
//   ratings.csv  userId,movieId,rating,timestamp     32M rows, 877 MB
//   links.csv    movieId,imdbId,tmdbId
//
// movies.csv and links.csv (87,585 rows each) are small enough to parse in
// memory. ratings.csv is not: csv-parse/sync would need the whole 877 MB file
// as one string plus 32M live objects. streamRatings() below reads it as a
// line stream instead, so peak memory stays independent of file size.

import { createReadStream, readFileSync, existsSync } from "node:fs"
import { join } from "node:path"
import { parse } from "csv-parse/sync"

/** Counts of the pristine ml-32m dataset, asserted by the build script. */
export const EXPECTED = { users: 200948, ratings: 32000204, movies: 87585 }

/**
 * The original Java app filtered to films released after 1980 so that raters
 * would recognise the titles. It did so with a fixed substring index; we parse
 * the "(YYYY)" suffix properly instead, because a handful of MovieLens titles
 * carry no year at all and some end in an "(a.k.a. ...)" parenthetical.
 */
export const MIN_YEAR = 1981

function readCsv(dir, name) {
  const path = join(dir, name)
  if (!existsSync(path)) {
    throw new Error(
      `Missing ${name}.\n` +
        `Expected the ml-32m CSVs in: ${dir}\n` +
        `Download https://files.grouplens.org/datasets/movielens/ml-32m.zip and unzip it there.`,
    )
  }
  return parse(readFileSync(path), { columns: true, skip_empty_lines: true, bom: true })
}

/**
 * Yield every ratings.csv row as {userId, movieId, rating}, without ever
 * holding the whole file in memory. Rows are NOT guaranteed grouped by user -
 * callers that need per-user grouping (itemitem.mjs) accumulate into a Map
 * themselves rather than relying on file order.
 */
export async function* streamRatings(dir) {
  const path = join(dir, "ratings.csv")
  if (!existsSync(path)) {
    throw new Error(
      `Missing ratings.csv.\nExpected the ml-32m CSVs in: ${dir}\n` +
        `Download https://files.grouplens.org/datasets/movielens/ml-32m.zip and unzip it there.`,
    )
  }
  const stream = createReadStream(path, { highWaterMark: 1 << 22, encoding: "latin1" })
  let tail = ""
  let first = true
  for await (const chunk of stream) {
    const buf = tail + chunk
    let start = 0
    while (true) {
      const nl = buf.indexOf("\n", start)
      if (nl === -1) break
      const line = buf.slice(start, nl)
      start = nl + 1
      if (first) { first = false; continue } // header row
      const c1 = line.indexOf(",")
      const c2 = line.indexOf(",", c1 + 1)
      const c3 = line.indexOf(",", c2 + 1)
      if (c3 === -1) continue // blank trailing line
      yield {
        userId: +line.slice(0, c1),
        movieId: +line.slice(c1 + 1, c2),
        rating: +line.slice(c2 + 1, c3),
      }
    }
    tail = buf.slice(start)
  }
  if (tail.trim()) {
    const c1 = tail.indexOf(","), c2 = tail.indexOf(",", c1 + 1), c3 = tail.indexOf(",", c2 + 1)
    if (c3 !== -1) yield { userId: +tail.slice(0, c1), movieId: +tail.slice(c1 + 1, c2), rating: +tail.slice(c2 + 1, c3) }
  }
}

/**
 * Pull the trailing release year out of a MovieLens title.
 * "Toy Story (1995)" -> { title: "Toy Story", year: 1995 }
 * Returns year: null when there is no parseable year.
 */
export function parseTitleYear(raw) {
  const m = /^(.*?)\s*\((\d{4})\)\s*$/.exec(raw.trim())
  if (!m) return { title: raw.trim(), year: null }
  return { title: m[1].trim(), year: Number(m[2]) }
}

/**
 * MovieLens stores titles with the leading article moved to the end, e.g.
 * "Matrix, The". Without un-inverting these, typing "the matrix" into the
 * search box finds nothing - which is exactly the bug the mock search hid.
 */
const ARTICLES = new Set(["The", "A", "An", "La", "Le", "Les", "Il", "L'", "Der", "Die", "Das", "El", "Los", "Las", "Un", "Une", "Det", "De", "Den"])

export function deInvertTitle(title) {
  const m = /^(.*),\s+([^,]+)$/.exec(title)
  if (!m) return title
  const article = m[2].trim()
  if (!ARTICLES.has(article)) return title
  // "L'" glues to the next word; every other article takes a space.
  return article.endsWith("'") ? `${article}${m[1]}` : `${article} ${m[1]}`
}

/**
 * Split off "(a.k.a. Foo)" / "(Foo)" alternates so they stay searchable
 * without cluttering the displayed title.
 */
export function splitAltTitles(title) {
  const alts = []
  const main = title
    .replace(/\((?:a\.k\.a\.\s*)?([^)]+)\)/g, (_, inner) => {
      alts.push(inner.trim())
      return ""
    })
    .replace(/\s{2,}/g, " ")
    .trim()
  return { title: main || title, altTitles: alts }
}

/** Load and normalise movies.csv + links.csv. Small files, parsed in memory. */
export function loadMovies(dir) {
  const movieRows = readCsv(dir, "movies.csv")
  const linkRows = readCsv(dir, "links.csv")

  const links = new Map()
  for (const r of linkRows) {
    links.set(Number(r.movieId), {
      // imdbId is zero-padded ("0114709"). Keep it a string - parseInt would
      // silently strip the leading zero and every IMDb link would 404.
      imdbId: (r.imdbId ?? "").trim() || null,
      tmdbId: (r.tmdbId ?? "").trim() ? Number(r.tmdbId) : null,
    })
  }

  return movieRows.map((r) => {
    const movieId = Number(r.movieId)
    const { title: withoutYear, year } = parseTitleYear(r.title)
    const { title: stripped, altTitles } = splitAltTitles(deInvertTitle(withoutYear))
    const link = links.get(movieId) ?? { imdbId: null, tmdbId: null }
    return {
      movieId,
      rawTitle: r.title,
      title: stripped,
      altTitles,
      year,
      genres: r.genres && r.genres !== "(no genres listed)" ? r.genres.split("|") : [],
      imdbId: link.imdbId,
      tmdbId: link.tmdbId,
    }
  })
}

/**
 * One streaming pass: per-movie rating count and mean, over ALL 32M ratings
 * (not just the catalogue - a film needs its true population count to clear
 * the catalogue/recommendable thresholds). Also returns total row and
 * distinct-user counts, for the sanity check against EXPECTED.
 *
 * MovieLens ids are small integers but not dense (movieId runs past 292,000
 * for ~87,585 distinct films), so counts are kept in a plain Map rather than
 * a giant mostly-empty typed array.
 */
export async function computeMovieStats(dir) {
  const count = new Map()
  const sum = new Map()
  const users = new Set()
  let rows = 0
  for await (const { userId, movieId, rating } of streamRatings(dir)) {
    count.set(movieId, (count.get(movieId) ?? 0) + 1)
    sum.set(movieId, (sum.get(movieId) ?? 0) + rating)
    users.add(userId)
    rows++
  }
  const stats = new Map()
  for (const movieId of count.keys()) {
    stats.set(movieId, { ratingCount: count.get(movieId), meanRating: sum.get(movieId) / count.get(movieId) })
  }
  return { stats, totalRatings: rows, userCount: users.size }
}

/**
 * The catalogue: what a visitor can search for and rate.
 *
 * The long tail of this dataset is brutal - the median film has a handful of
 * ratings. Those are neither recognisable to a visitor nor informative to the
 * recommender, so they come out. A separate, higher bar (see build-dataset.mjs)
 * decides which catalogue films get a place in the recommender's neighbour
 * table; this threshold only decides what is searchable and rateable at all.
 */
export function buildCatalog(movies, mStats, { minYear = MIN_YEAR, minRatingCount = 20 } = {}) {
  return movies
    .filter((m) => m.year !== null && m.year >= minYear)
    .filter((m) => (mStats.get(m.movieId)?.ratingCount ?? 0) >= minRatingCount)
    .map((m) => ({ ...m, ...mStats.get(m.movieId) }))
    .sort((a, b) => b.ratingCount - a.ratingCount || a.movieId - b.movieId)
}

/** Histogram of ratings-per-movie, so the thresholds get tuned on real numbers. */
export function ratingCountHistogram(mStats, buckets = [1, 2, 5, 10, 20, 50, 100, 200, 500]) {
  const counts = new Map(buckets.map((b) => [b, 0]))
  for (const { ratingCount } of mStats.values()) {
    for (const b of buckets) if (ratingCount >= b) counts.set(b, counts.get(b) + 1)
  }
  return buckets.map((b) => ({ atLeast: b, movies: counts.get(b) }))
}
