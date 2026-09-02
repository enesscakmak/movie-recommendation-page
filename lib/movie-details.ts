import { useEffect, useState } from "react"

export interface MovieDetails {
  plot: string | null
  genres: string[]
  actors: string[]
  director: string | null
  runtime: string | null
  rated: string | null
  awards: string | null
  imdbRating: number | null
  imdbVotes: string | null
}

const cache = new Map<string, Promise<MovieDetails | null>>()

async function fetchDetails(imdbId: string): Promise<MovieDetails | null> {
  try {
    const res = await fetch(`/api/movie/${imdbId}`)
    if (!res.ok) return null
    return (await res.json()) as MovieDetails
  } catch {
    return null
  }
}

export interface UseMovieDetailsResult {
  details: MovieDetails | null
  loading: boolean
  error: boolean
}

export function useMovieDetails(imdbId: string | null): UseMovieDetailsResult {
  const [state, setState] = useState<UseMovieDetailsResult>({ details: null, loading: false, error: false })

  useEffect(() => {
    if (!imdbId) {
      setState({ details: null, loading: false, error: false })
      return
    }
    let cancelled = false
    setState({ details: null, loading: true, error: false })
    if (!cache.has(imdbId)) cache.set(imdbId, fetchDetails(imdbId))
    cache.get(imdbId)!.then((details) => {
      if (cancelled) return
      setState({ details, loading: false, error: details === null })
    })
    return () => {
      cancelled = true
    }
  }, [imdbId])

  return state
}
