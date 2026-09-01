
import { createReadStream, readFileSync, existsSync } from "node:fs"
import { join } from "node:path"
import { parse } from "csv-parse/sync"

export const EXPECTED = { users: 200948, ratings: 32000204, movies: 87585 }

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
      if (first) { first = false; continue }
      const c1 = line.indexOf(",")
      const c2 = line.indexOf(",", c1 + 1)
      const c3 = line.indexOf(",", c2 + 1)
      if (c3 === -1) continue
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

export function parseTitleYear(raw) {
  const m = /^(.*?)\s*\((\d{4})\)\s*$/.exec(raw.trim())
  if (!m) return { title: raw.trim(), year: null }
  return { title: m[1].trim(), year: Number(m[2]) }
}

const ARTICLES = new Set(["The", "A", "An", "La", "Le", "Les", "Il", "L'", "Der", "Die", "Das", "El", "Los", "Las", "Un", "Une", "Det", "De", "Den"])

export function deInvertTitle(title) {
  const m = /^(.*),\s+([^,]+)$/.exec(title)
  if (!m) return title
  const article = m[2].trim()
  if (!ARTICLES.has(article)) return title
  return article.endsWith("'") ? `${article}${m[1]}` : `${article} ${m[1]}`
}

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

export function loadMovies(dir) {
  const movieRows = readCsv(dir, "movies.csv")
  const linkRows = readCsv(dir, "links.csv")

  const links = new Map()
  for (const r of linkRows) {
    links.set(Number(r.movieId), {
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

export function buildCatalog(movies, mStats, { minYear = MIN_YEAR, minRatingCount = 20 } = {}) {
  return movies
    .filter((m) => m.year !== null && m.year >= minYear)
    .filter((m) => (mStats.get(m.movieId)?.ratingCount ?? 0) >= minRatingCount)
    .map((m) => ({ ...m, ...mStats.get(m.movieId) }))
    .sort((a, b) => b.ratingCount - a.ratingCount || a.movieId - b.movieId)
}

export function ratingCountHistogram(mStats, buckets = [1, 2, 5, 10, 20, 50, 100, 200, 500]) {
  const counts = new Map(buckets.map((b) => [b, 0]))
  for (const { ratingCount } of mStats.values()) {
    for (const b of buckets) if (ratingCount >= b) counts.set(b, counts.get(b) + 1)
  }
  return buckets.map((b) => ({ atLeast: b, movies: counts.get(b) }))
}
