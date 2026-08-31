"use client"

import { useState, useEffect, useMemo } from "react"
import { Input } from "@/components/ui/input"
import { Search } from "lucide-react"
import type { CatalogMovie } from "@/lib/recommender"
import { posterUrl } from "@/lib/recommender"

interface MovieSearchProps {
  catalog: CatalogMovie[]
  onMovieSelect: (movie: CatalogMovie) => void
  ratedIds?: Set<number>
}

const MAX_RESULTS = 8

export function MovieSearch({ catalog, onMovieSelect, ratedIds }: MovieSearchProps) {
  const [query, setQuery] = useState("")
  const [debounced, setDebounced] = useState("")

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 200)
    return () => clearTimeout(t)
  }, [query])

  const results = useMemo(() => {
    if (!debounced) return []
    const q = debounced.toLowerCase()
    const scored: Array<[CatalogMovie, number]> = []
    for (const m of catalog) {
      const title = m.title.toLowerCase()
      let score = -1
      if (title === q) score = 100
      else if (title.startsWith(q)) score = 80
      else if (title.includes(q)) score = 50
      else if (m.altTitles.some((a) => a.toLowerCase().includes(q))) score = 30
      if (score < 0) continue
      scored.push([m, score + Math.min(m.ratingCount, 5000) / 5000])
    }
    scored.sort((a, b) => b[1] - a[1])
    return scored.slice(0, MAX_RESULTS).map(([m]) => m)
  }, [catalog, debounced])

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search for a movie..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      {results.length > 0 && (
        <div className="rounded-md border">
          {results.map((movie) => {
            const poster = posterUrl(movie.posterPath, "w185")
            const alreadyRated = ratedIds?.has(movie.movieId)
            return (
              <button
                key={movie.movieId}
                type="button"
                className="flex w-full items-center gap-3 border-b p-3 last:border-0 hover:bg-muted/50 text-left disabled:opacity-50"
                onClick={() => onMovieSelect(movie)}
              >
                <div className="h-12 w-8 flex-shrink-0 overflow-hidden rounded bg-muted">
                  {poster && <img src={poster} alt={movie.title} className="h-full w-full object-cover" />}
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="font-medium truncate">{movie.title}</h4>
                  <p className="text-xs text-muted-foreground truncate">
                    {movie.year} • {movie.genres.slice(0, 2).join(", ") || "No genres listed"}
                  </p>
                </div>
                {alreadyRated && <span className="text-xs text-muted-foreground shrink-0">Rated</span>}
              </button>
            )
          })}
        </div>
      )}

      {debounced && results.length === 0 && (
        <div className="rounded-md border p-4 text-center text-muted-foreground">No movies found for &quot;{debounced}&quot;</div>
      )}
    </div>
  )
}
