import { NextResponse } from "next/server"
import { getCloudflareContext } from "@opennextjs/cloudflare"

interface OmdbResponse {
  Response: "True" | "False"
  Error?: string
  Plot?: string
  Genre?: string
  Actors?: string
  Director?: string
  Writer?: string
  Runtime?: string
  Rated?: string
  Awards?: string
  imdbRating?: string
  imdbVotes?: string
}

const clean = (value: string | undefined): string | null => (value && value !== "N/A" ? value : null)

export async function GET(_request: Request, { params }: { params: Promise<{ imdbId: string }> }) {
  const { imdbId } = await params
  if (!/^\d+$/.test(imdbId)) {
    return NextResponse.json({ error: "Invalid IMDb id" }, { status: 400 })
  }
  const tt = `tt${imdbId.padStart(7, "0")}`

  const cache = typeof caches !== "undefined" ? (caches as unknown as { default: Cache }).default : null
  const cacheKey = new Request(`https://cache.internal/omdb/${tt}`)
  const cached = await cache?.match(cacheKey)
  if (cached) return cached

  const { env } = await getCloudflareContext({ async: true })
  const apiKey = env.OMDB_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: "OMDb is not configured" }, { status: 500 })
  }

  const omdbRes = await fetch(`https://www.omdbapi.com/?i=${tt}&plot=full&apikey=${apiKey}`)
  if (!omdbRes.ok) {
    return NextResponse.json({ error: "OMDb request failed" }, { status: 502 })
  }

  const data = (await omdbRes.json()) as OmdbResponse
  if (data.Response === "False") {
    return NextResponse.json({ error: data.Error ?? "Not found" }, { status: 404 })
  }

  const payload = {
    plot: clean(data.Plot),
    genres: data.Genre ? data.Genre.split(",").map((g) => g.trim()).filter(Boolean) : [],
    actors: data.Actors ? data.Actors.split(",").map((a) => a.trim()).filter(Boolean) : [],
    director: clean(data.Director),
    runtime: clean(data.Runtime),
    rated: clean(data.Rated),
    awards: clean(data.Awards),
    imdbRating: data.imdbRating && data.imdbRating !== "N/A" ? Number(data.imdbRating) : null,
    imdbVotes: clean(data.imdbVotes),
  }

  const response = NextResponse.json(payload, { headers: { "Cache-Control": "public, max-age=86400" } })
  if (cache) await cache.put(cacheKey, response.clone())
  return response
}
