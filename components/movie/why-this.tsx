"use client"

import { useEffect, useState } from "react"
import { StarRating } from "@/components/rating/star-rating"
import { useProfile } from "@/contexts/profile-context"
import {
  explain,
  loadCatalog,
  loadNeighborTable,
  type CatalogMovie,
  type ItemNeighbors,
  type UserRating,
} from "@/lib/recommender"

interface WhyThisProps {
  movie: CatalogMovie
}

export function WhyThis({ movie }: WhyThisProps) {
  const { profile } = useProfile()
  const [catalog, setCatalog] = useState<CatalogMovie[] | null>(null)
  const [neighbors, setNeighbors] = useState<ItemNeighbors | null>(null)

  useEffect(() => {
    loadCatalog().then(setCatalog).catch(() => {})
    loadNeighborTable().then(setNeighbors).catch(() => {})
  }, [])

  if (!profile || !catalog || !neighbors) return null

  const userRatings: UserRating[] = Object.entries(profile.ratings).map(([movieId, rating]) => ({
    movieId: Number(movieId),
    rating,
    ratedAt: profile.ratedAt[movieId] ?? new Date(0).toISOString(),
  }))

  const contributions = explain(movie.index, userRatings, neighbors, catalog, 5)
  if (contributions.length === 0) return null

  const total = contributions.reduce((sum, c) => sum + c.contribution, 0)

  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Why this was recommended</p>
      <div className="space-y-2">
        {contributions.map((c) => (
          <div key={c.movieId} className="flex items-center gap-3">
            <span className="w-32 flex-shrink-0 truncate text-sm sm:w-40" title={c.title}>
              {c.title}
            </span>
            <StarRating value={c.rating} size="sm" readOnly />
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary" style={{ width: `${c.similarity * 100}%` }} />
            </div>
            <span className="w-14 flex-shrink-0 text-right text-xs text-muted-foreground">
              +{c.contribution.toFixed(2)}
            </span>
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Score = (your rating − 3) × similarity, summed across your ratings. These add up to {total.toFixed(2)}.
      </p>
    </div>
  )
}
