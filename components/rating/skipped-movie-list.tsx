"use client"

import { useState } from "react"
import { X } from "lucide-react"
import { StarRating } from "@/components/rating/star-rating"
import { Button } from "@/components/ui/button"
import { MovieDetailDialog } from "@/components/movie/movie-detail-dialog"
import type { CatalogMovie } from "@/lib/recommender"
import { posterUrl } from "@/lib/recommender"

interface SkippedMovieListProps {
  movies: CatalogMovie[]
  onRate: (movieId: number, rating: number) => void
  onUnskip: (movieId: number) => void
}

export function SkippedMovieList({ movies, onRate, onUnskip }: SkippedMovieListProps) {
  const [openMovieId, setOpenMovieId] = useState<number | null>(null)
  const openMovie = movies.find((m) => m.movieId === openMovieId) ?? null
  if (movies.length === 0) {
    return (
      <div className="rounded-md border p-8 text-center">
        <p className="text-muted-foreground">You haven&apos;t flagged any movies as unwatched yet.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-medium">Didn&apos;t Watch ({movies.length})</h3>
      <div className="space-y-3">
        {movies.map((movie) => {
          const poster = posterUrl(movie.posterPath, "w185")
          return (
            <div key={movie.movieId} className="flex items-center gap-4 rounded-md border p-3">
              <button
                type="button"
                onClick={() => setOpenMovieId(movie.movieId)}
                className="h-16 w-12 flex-shrink-0 overflow-hidden rounded bg-muted"
                aria-label={`View details for ${movie.title}`}
              >
                {poster && <img src={poster} alt={movie.title} className="h-full w-full object-cover" />}
              </button>
              <div className="flex-1 min-w-0">
                <h4 className="font-medium truncate">{movie.title}</h4>
                <p className="text-sm text-muted-foreground">{movie.year}</p>
              </div>
              <StarRating value={0} onChange={(rating) => onRate(movie.movieId, rating)} size="sm" />
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onUnskip(movie.movieId)}
                className="flex-shrink-0"
                aria-label={`Remove unwatched flag for ${movie.title}`}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          )
        })}
      </div>
      {openMovie && (
        <MovieDetailDialog
          movie={openMovie}
          open={true}
          onOpenChange={(open) => !open && setOpenMovieId(null)}
          userRating={0}
          onRate={(rating) => onRate(openMovie.movieId, rating)}
        />
      )}
    </div>
  )
}
