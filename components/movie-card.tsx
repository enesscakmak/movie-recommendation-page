"use client"

import Image from "next/image"
import Link from "next/link"
import { ExternalLink, EyeOff } from "lucide-react"
import { Card, CardContent, CardFooter } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { StarRating } from "@/components/rating/star-rating"
import type { CatalogMovie } from "@/lib/recommender"
import { posterUrl, imdbUrl, useOverview } from "@/lib/recommender"

interface MovieCardProps {
  movie: CatalogMovie
  /** Star rating this profile gave it, if any. */
  userRating?: number
  onRate?: (rating: number) => void
  onSkip?: () => void
  /** movieIds of the visitor's own rated films that produced this recommendation. */
  because?: string[]
}

export default function MovieCard({ movie, userRating, onRate, onSkip, because }: MovieCardProps) {
  const poster = posterUrl(movie.posterPath)
  const overview = useOverview(movie.index)

  return (
    <Card className="overflow-hidden transition-all hover:shadow-lg flex flex-col">
      <div className="relative aspect-[2/3] w-full overflow-hidden bg-muted">
        {poster ? (
          <Image
            src={poster}
            alt={movie.title}
            fill
            className="object-cover transition-transform hover:scale-105"
            sizes="(max-width: 640px) 100vw, (max-width: 768px) 50vw, (max-width: 1024px) 33vw, 25vw"
            unoptimized
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground p-4 text-center">
            {movie.title}
          </div>
        )}
        <Link
          href={imdbUrl(movie.imdbId)}
          target="_blank"
          rel="noopener noreferrer"
          className="absolute right-2 top-2 rounded-full bg-black/60 p-1.5 text-white hover:bg-black/80"
          aria-label={`${movie.title} on IMDb`}
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </Link>
      </div>
      <CardContent className="p-4 flex-1">
        <div className="flex items-start justify-between gap-2 mb-2">
          <h3 className="font-bold text-base line-clamp-1" title={movie.title}>
            {movie.title}
          </h3>
          <span className="text-sm text-muted-foreground shrink-0">{movie.year}</span>
        </div>
        {because && because.length > 0 && (
          <p className="text-xs text-muted-foreground mb-2 line-clamp-1">Because you liked {because.join(", ")}</p>
        )}
        {overview && <p className="text-muted-foreground text-sm line-clamp-3 mb-2">{overview}</p>}
        <div className="flex flex-wrap gap-1">
          {movie.genres.slice(0, 3).map((g) => (
            <Badge key={g} variant="outline" className="text-xs">
              {g}
            </Badge>
          ))}
        </div>
      </CardContent>
      {(onRate || onSkip) && (
        <CardFooter className="px-4 pb-4 pt-0 flex items-center justify-between gap-2">
          <StarRating value={userRating ?? 0} size="sm" onChange={onRate} />
          {onSkip && (
            <button
              type="button"
              onClick={onSkip}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <EyeOff className="h-3.5 w-3.5" />
              Haven&apos;t seen it
            </button>
          )}
        </CardFooter>
      )}
    </Card>
  )
}
