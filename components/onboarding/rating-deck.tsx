"use client"

import { useEffect, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { Compass, ExternalLink, EyeOff } from "lucide-react"
import { StarRating } from "@/components/rating/star-rating"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { posterUrl, imdbUrl, useOverview, type CatalogMovie } from "@/lib/recommender"

interface RatingDeckProps {
  movies: CatalogMovie[]
  ratingCount: number
  targetCount: number
  ratings?: Record<number, number>
  onRate: (movieId: number, rating: number) => void
  onSkip: (movieId: number) => void
  onBrowseAll: () => void
}

export function RatingDeck({ movies, ratingCount, targetCount, ratings, onRate, onSkip, onBrowseAll }: RatingDeckProps) {
  const [index, setIndex] = useState(0)
  const movie = movies[index]
  const overview = useOverview(movie?.index ?? -1)

  const advance = () => setIndex((i) => Math.min(i + 1, movies.length))
  const back = () => setIndex((i) => Math.max(i - 1, 0))

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!movie) return
      if (e.target instanceof HTMLElement && ["INPUT", "TEXTAREA"].includes(e.target.tagName)) return
      if (e.key >= "1" && e.key <= "5") {
        onRate(movie.movieId, Number(e.key))
        advance()
      } else if (e.key === "ArrowRight") {
        onSkip(movie.movieId)
        advance()
      } else if (e.key === "ArrowLeft") {
        back()
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [movie, onRate, onSkip])

  if (!movie) {
    return (
      <div className="mx-auto max-w-lg py-16 text-center">
        <p className="mb-2 text-lg font-medium">That&apos;s everything for now.</p>
        <p className="mb-6 text-muted-foreground">
          Rated {ratingCount}/{targetCount} so far - browse the full catalogue to find a few more.
        </p>
        <Button onClick={onBrowseAll}>
          <Compass className="mr-2 h-4 w-4" />
          Browse everything
        </Button>
      </div>
    )
  }

  const poster = posterUrl(movie.posterPath, "w342")
  const userRating = ratings?.[movie.movieId] ?? 0

  return (
    <div className="mx-auto max-w-lg">
      <div className="mb-4 flex items-center justify-between text-sm text-muted-foreground">
        <span>
          {index + 1} of {movies.length}
        </span>
        <span>
          {ratingCount}/{targetCount} rated
        </span>
      </div>

      <Card className="overflow-hidden">
        <div className="relative aspect-[2/3] w-full bg-muted">
          {poster ? (
            <Image src={poster} alt={movie.title} fill className="object-cover" unoptimized priority />
          ) : (
            <div className="flex h-full w-full items-center justify-center p-6 text-center text-muted-foreground">
              {movie.title}
            </div>
          )}
        </div>
        <CardContent className="space-y-3 p-5">
          <div className="flex items-start justify-between gap-2">
            <h2 className="text-xl font-bold leading-tight">{movie.title}</h2>
            <span className="shrink-0 text-muted-foreground">{movie.year}</span>
          </div>

          <div className="flex flex-wrap gap-1">
            {movie.genres.slice(0, 4).map((g) => (
              <Badge key={g} variant="outline" className="text-xs">
                {g}
              </Badge>
            ))}
          </div>

          {overview && <p className="line-clamp-3 text-sm text-muted-foreground">{overview}</p>}

          <div className="flex items-center justify-between pt-2">
            <StarRating
              value={userRating}
              onChange={(rating) => {
                onRate(movie.movieId, rating)
                advance()
              }}
            />
            <button
              type="button"
              onClick={() => {
                onSkip(movie.movieId)
                advance()
              }}
              className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
              <EyeOff className="h-4 w-4" />
              Haven&apos;t seen it
            </button>
          </div>
        </CardContent>
      </Card>

      <div className="mt-4 flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={back} disabled={index === 0}>
          ← Back
        </Button>
        <Link
          href={imdbUrl(movie.imdbId)}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          IMDb <ExternalLink className="h-3 w-3" />
        </Link>
        <Button variant="ghost" size="sm" onClick={onBrowseAll}>
          Browse everything instead
        </Button>
      </div>

      <p className="mt-4 text-center text-xs text-muted-foreground">Press 1-5 to rate, → to skip, ← to go back</p>
    </div>
  )
}
