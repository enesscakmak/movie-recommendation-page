"use client"

import { useState } from "react"
import Image from "next/image"
import { StarRating } from "@/components/rating/star-rating"
import { Button } from "@/components/ui/button"
import { Trash2 } from "lucide-react"
import type { MovieRating } from "@/types/movie"

interface RatedMovieListProps {
  ratings: MovieRating[]
  onRemoveRating: (movieId: number) => void
}

export function RatedMovieList({ ratings, onRemoveRating }: RatedMovieListProps) {
  const [sortBy, setSortBy] = useState<"date" | "rating">("date")

  const sortedRatings = [...ratings].sort((a, b) => {
    if (sortBy === "date") {
      return new Date(b.ratedAt).getTime() - new Date(a.ratedAt).getTime()
    } else {
      return b.rating - a.rating
    }
  })

  if (ratings.length === 0) {
    return (
      <div className="rounded-md border p-8 text-center">
        <p className="text-muted-foreground">You haven't rated any movies yet.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-medium">Your Ratings</h3>
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
        {sortedRatings.map((item) => (
          <div key={item.movie.id} className="flex items-center gap-4 rounded-md border p-3">
            <div className="h-16 w-12 flex-shrink-0 overflow-hidden rounded">
              <Image
                src={item.movie.image || "/placeholder.svg"}
                alt={item.movie.title}
                width={48}
                height={72}
                className="h-full w-full object-cover"
              />
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="font-medium truncate">{item.movie.title}</h4>
              <div className="flex items-center gap-2">
                <StarRating initialRating={item.rating} readOnly size="sm" />
                <span className="text-sm text-muted-foreground">{new Date(item.ratedAt).toLocaleDateString()}</span>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onRemoveRating(item.movie.id)}
              className="flex-shrink-0"
              aria-label={`Remove rating for ${item.movie.title}`}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  )
}

