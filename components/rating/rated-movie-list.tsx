"use client"

import { useState } from "react"
import { StarRating } from "@/components/rating/star-rating"
import { Button } from "@/components/ui/button"
import { Trash2 } from "lucide-react"
import { MovieDetailDialog } from "@/components/movie/movie-detail-dialog"
import type { CatalogMovie } from "@/lib/recommender"
import { posterUrl } from "@/lib/recommender"

export interface RatedEntry {
  movie: CatalogMovie
  rating: number
  ratedAt: string
}

interface RatedMovieListProps {
  ratings: RatedEntry[]
  onRate: (movieId: number, rating: number) => void
  onRemoveRating: (movieId: number) => void
}

export function RatedMovieList({ ratings, onRate, onRemoveRating }: RatedMovieListProps) {
  const [sortBy, setSortBy] = useState<"date" | "rating">("date")
  const [openMovieId, setOpenMovieId] = useState<number | null>(null)
  const openEntry = ratings.find((r) => r.movie.movieId === openMovieId) ?? null

  const sortedRatings = [...ratings].sort((a, b) =>
    sortBy === "date" ? new Date(b.ratedAt).getTime() - new Date(a.ratedAt).getTime() : b.rating - a.rating,
  )

  if (ratings.length === 0) {
    return (
      <div className="rounded-md border p-8 text-center">
        <p className="text-muted-foreground">You haven&apos;t rated any movies yet.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-medium">Your Ratings ({ratings.length})</h3>
        <div className="flex gap-2">
          <Button variant={sortBy === "date" ? "default" : "outline"} size="sm" onClick={() => setSortBy("date")}>
            Recent
          </Button>
          <Button variant={sortBy === "rating" ? "default" : "outline"} size="sm" onClick={() => setSortBy("rating")}>
            Highest Rated
          </Button>
        </div>
      </div>

      <div className="space-y-3">
        {sortedRatings.map((item) => {
          const poster = posterUrl(item.movie.posterPath, "w185")
          return (
            <div key={item.movie.movieId} className="flex items-center gap-4 rounded-md border p-3">
              <button
                type="button"
                onClick={() => setOpenMovieId(item.movie.movieId)}
                className="h-16 w-12 flex-shrink-0 overflow-hidden rounded bg-muted"
                aria-label={`View details for ${item.movie.title}`}
              >
                {poster && <img src={poster} alt={item.movie.title} className="h-full w-full object-cover" />}
              </button>
              <div className="flex-1 min-w-0">
                <h4 className="font-medium truncate">{item.movie.title}</h4>
                <div className="flex items-center gap-2">
                  <StarRating value={item.rating} onChange={(rating) => onRate(item.movie.movieId, rating)} size="sm" />
                  <span className="text-sm text-muted-foreground">{new Date(item.ratedAt).toLocaleDateString()}</span>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onRemoveRating(item.movie.movieId)}
                className="flex-shrink-0"
                aria-label={`Remove rating for ${item.movie.title}`}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          )
        })}
      </div>
      {openEntry && (
        <MovieDetailDialog
          movie={openEntry.movie}
          open={true}
          onOpenChange={(open) => !open && setOpenMovieId(null)}
          userRating={openEntry.rating}
          onRate={(rating) => onRate(openEntry.movie.movieId, rating)}
        />
      )}
    </div>
  )
}
