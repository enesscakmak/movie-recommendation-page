
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs"
import { join } from "node:path"

const BASE = "https://api.themoviedb.org/3"

const CONCURRENCY = 8
const STAGGER_MS = 25
const MAX_RETRIES = 4

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

export function cachePathFor(cacheDir, tmdbId) {
  return join(cacheDir, `${tmdbId}.json`)
}

const isV4Token = (apiKey) => apiKey.includes(".")

async function fetchOne(tmdbId, apiKey) {
  const v4 = isV4Token(apiKey)
  const url = v4 ? `${BASE}/movie/${tmdbId}` : `${BASE}/movie/${tmdbId}?api_key=${apiKey}`
  const headers = v4 ? { Authorization: `Bearer ${apiKey}`, accept: "application/json" } : undefined

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    let res
    try {
      res = await fetch(url, { headers })
    } catch (err) {
      if (attempt === MAX_RETRIES) throw err
      await sleep(500 * 2 ** attempt)
      continue
    }

    if (res.ok) return await res.json()

    if (res.status === 404) return { __missing: true, status: 404 }

    if (res.status === 429 || res.status >= 500) {
      if (attempt === MAX_RETRIES) return { __missing: true, status: res.status }
      const retryAfter = Number(res.headers.get("retry-after"))
      await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 500 * 2 ** attempt)
      continue
    }

    return { __missing: true, status: res.status }
  }
  return { __missing: true, status: 0 }
}

export async function fetchDetails(tmdbIds, { apiKey, cacheDir, refresh = false, onProgress } = {}) {
  mkdirSync(cacheDir, { recursive: true })

  const ids = [...new Set(tmdbIds.filter((id) => Number.isFinite(id)))]
  const out = new Map()
  let done = 0
  let fetched = 0

  const queue = [...ids]

  async function worker(slot) {
    await sleep(slot * STAGGER_MS)
    while (queue.length > 0) {
      const id = queue.shift()
      const path = cachePathFor(cacheDir, id)

      let data
      if (!refresh && existsSync(path)) {
        try {
          data = JSON.parse(readFileSync(path, "utf8"))
        } catch {
          data = undefined // corrupt cache entry; refetch
        }
      }

      if (data === undefined) {
        if (!apiKey) throw new Error("TMDB_API_KEY is not set and the cache is incomplete")
        data = await fetchOne(id, apiKey)
        writeFileSync(path, JSON.stringify(data))
        fetched++
      }

      out.set(
        id,
        data.__missing
          ? { posterPath: null, overview: "" }
          : {
              posterPath: data.poster_path ?? null,
              overview: typeof data.overview === "string" ? data.overview : "",
            },
      )

      done++
      if (onProgress && done % 100 === 0) onProgress(done, ids.length)
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, (_, i) => worker(i)))
  if (onProgress) onProgress(done, ids.length)

  return { details: out, fetched, cached: ids.length - fetched }
}
