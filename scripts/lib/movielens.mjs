// Parsing and filtering for the MovieLens ml-latest-small dataset.
//
// The dataset ships three files we care about:
//   movies.csv   movieId,title,genres          title carries a "(YYYY)" suffix
//   ratings.csv  userId,movieId,rating,timestamp
//   links.csv    movieId,imdbId,tmdbId
//
// Nothing here touches the network or the filesystem beyond reading those files,
// so it stays easy to reason about and to test.

import { readFileSync, existsSync } from "node:fs"
import { join } from "node:path"
import { parse } from "csv-parse/sync"

/** Counts of the pristine ml-latest-small dataset, asserted by the build script. */
export const EXPECTED = { users: 610, ratings: 100836, movies: 9742 }

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
        `Expected the ml-latest-small CSVs in: ${dir}\n` +
        `Download https://files.grouplens.org/datasets/movielens/ml-latest-small.zip ` +
        `and unzip it there.`,
    )
  }
  return parse(readFileSync(path), { columns: true, skip_empty_lines: true, bom: true })
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
 * MovieLens stores titles with the leading article moved to the end:
 * "Matrix, The" / "Batman Begins" / "Fabuleux destin d'Amélie Poulain, Le".
 * Without un-inverting these, typing "the matrix" into the search box finds
 * nothing - which is exactly the bug the mock search hid.
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

/** Load and normalise all three CSVs. No filtering yet. */
export function loadRaw(dir) {
  const movieRows = readCsv(dir, "movies.csv")
  const ratingRows = readCsv(dir, "ratings.csv")
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

  const movies = movieRows.map((r) => {
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

  const ratings = ratingRows.map((r) => ({
    userId: Number(r.userId),
    movieId: Number(r.movieId),
    rating: Number(r.rating),
  }))

  return { movies, ratings }
}

/**
 * Per-user L2 norm and mean over the COMPLETE unfiltered rating set.
 *
 * This matters more than it looks. Cosine similarity divides by each user's
 * norm; if that norm were computed after filtering the catalogue down, every
 * similarity would silently drift away from what the Java app computed. The
 * dot product only ever touches catalogue movies (a visitor can only rate
 * those), so keeping full-set norms reproduces full-matrix cosine exactly
 * while shipping a fraction of the data.
 */
export function userStatsFull(ratings) {
  const sumSq = new Map()
  const sum = new Map()
  const count = new Map()
  for (const { userId, rating } of ratings) {
    sumSq.set(userId, (sumSq.get(userId) ?? 0) + rating * rating)
    sum.set(userId, (sum.get(userId) ?? 0) + rating)
    count.set(userId, (count.get(userId) ?? 0) + 1)
  }
  const stats = new Map()
  for (const userId of sumSq.keys()) {
    stats.set(userId, {
      norm: Math.sqrt(sumSq.get(userId)),
      mean: sum.get(userId) / count.get(userId),
      count: count.get(userId),
    })
  }
  return stats
}

/** ratingCount and mean rating per movie, over the full rating set. */
export function movieStats(ratings) {
  const sum = new Map()
  const count = new Map()
  for (const { movieId, rating } of ratings) {
    sum.set(movieId, (sum.get(movieId) ?? 0) + rating)
    count.set(movieId, (count.get(movieId) ?? 0) + 1)
  }
  const stats = new Map()
  for (const movieId of count.keys()) {
    stats.set(movieId, { ratingCount: count.get(movieId), meanRating: sum.get(movieId) / count.get(movieId) })
  }
  return stats
}

/**
 * The catalogue: what a visitor can search for and rate.
 *
 * The long tail of this dataset is brutal - the median film has about three
 * ratings. Those are neither recognisable to a visitor nor informative to the
 * recommender, so they come out.
 */
export function buildCatalog(movies, mStats, { minYear = MIN_YEAR, minRatingCount = 10 } = {}) {
  return movies
    .filter((m) => m.year !== null && m.year >= minYear)
    .filter((m) => (mStats.get(m.movieId)?.ratingCount ?? 0) >= minRatingCount)
    .map((m) => ({ ...m, ...mStats.get(m.movieId) }))
    .sort((a, b) => b.ratingCount - a.ratingCount || a.movieId - b.movieId)
}

/** Histogram of ratings-per-movie, so the thresholds get tuned on real numbers. */
export function ratingCountHistogram(mStats, buckets = [1, 2, 5, 10, 20, 50, 100, 200]) {
  const counts = new Map(buckets.map((b) => [b, 0]))
  for (const { ratingCount } of mStats.values()) {
    for (const b of buckets) if (ratingCount >= b) counts.set(b, counts.get(b) + 1)
  }
  return buckets.map((b) => ({ atLeast: b, movies: counts.get(b) }))
}
