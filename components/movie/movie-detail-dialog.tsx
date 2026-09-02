"use client"

import Image from "next/image"
import Link from "next/link"
import { ExternalLink, Loader2, Star } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { StarRating } from "@/components/rating/star-rating"
import { useMovieDetails } from "@/lib/movie-details"
import type { CatalogMovie } from "@/lib/recommender"
import { posterUrl, imdbUrl } from "@/lib/recommender"

interface MovieDetailDialogProps {
  movie: CatalogMovie
  open: boolean
  onOpenChange: (open: boolean) => void
  overview?: string
  userRating?: number
  onRate?: (rating: number) => void
}

export function MovieDetailDialog({ movie, open, onOpenChange, overview, userRating, onRate }: MovieDetailDialogProps) {
  const { details, loading, error } = useMovieDetails(open ? movie.imdbId : null)
  const poster = posterUrl(movie.posterPath, "w342")
  const plot = overview || details?.plot || ""

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {movie.title} <span className="font-normal text-muted-foreground">({movie.year})</span>
          </DialogTitle>
          <DialogDescription className="sr-only">Details for {movie.title}</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-[120px_1fr] gap-4 sm:grid-cols-[160px_1fr]">
          <div className="relative aspect-[2/3] w-full overflow-hidden rounded-md bg-muted">
            {poster ? (
              <Image src={poster} alt={movie.title} fill className="object-cover" unoptimized />
            ) : (
              <div className="flex h-full w-full items-center justify-center p-2 text-center text-xs text-muted-foreground">
                {movie.title}
              </div>
            )}
          </div>

          <div className="min-w-0 space-y-3">
            <div className="flex flex-wrap gap-1">
              {movie.genres.map((g) => (
                <Badge key={g} variant="outline" className="text-xs">
                  {g}
                </Badge>
              ))}
            </div>

            <div className="flex items-center gap-2 text-sm">
              <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
              {details?.imdbRating ? (
                <span>
                  <span className="font-semibold">{details.imdbRating.toFixed(1)}/10</span>
                  {details.imdbVotes && <span className="text-muted-foreground"> ({details.imdbVotes} votes)</span>}
                </span>
              ) : loading ? (
                <span className="text-muted-foreground">Loading IMDb rating…</span>
              ) : (
                <span className="text-muted-foreground">IMDb rating unavailable</span>
              )}
              <Link
                href={imdbUrl(movie.imdbId)}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-auto flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                IMDb <ExternalLink className="h-3 w-3" />
              </Link>
            </div>

            {(details?.runtime || details?.rated) && (
              <div className="flex gap-3 text-sm text-muted-foreground">
                {details.runtime && <span>{details.runtime}</span>}
                {details.rated && <span>{details.rated}</span>}
              </div>
            )}

            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Your rating</p>
              <StarRating value={userRating ?? 0} onChange={onRate} />
            </div>
          </div>
        </div>

        {loading && !details && (
          <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading details…
          </div>
        )}

        {plot && (
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Overview</p>
            <p className="text-sm text-muted-foreground">{plot}</p>
          </div>
        )}

        {details && details.actors.length > 0 && (
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Cast</p>
            <p className="text-sm text-muted-foreground">{details.actors.join(", ")}</p>
          </div>
        )}

        {details?.director && (
          <p className="text-sm">
            <span className="font-semibold">Director:</span> <span className="text-muted-foreground">{details.director}</span>
          </p>
        )}

        {details?.awards && (
          <p className="text-sm">
            <span className="font-semibold">Awards:</span> <span className="text-muted-foreground">{details.awards}</span>
          </p>
        )}

        {error && !loading && (
          <p className="text-xs text-muted-foreground">Extra details from IMDb aren&apos;t available right now.</p>
        )}
      </DialogContent>
    </Dialog>
  )
}
