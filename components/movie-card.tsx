"use client"

import { useEffect, useMemo, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { Bookmark, ExternalLink, EyeOff, Loader2, Sparkles } from "lucide-react"
import { Card, CardContent, CardFooter } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog"
import { StarRating } from "@/components/rating/star-rating"
import { MovieDetailDialog } from "@/components/movie/movie-detail-dialog"
import { useProfile } from "@/contexts/profile-context"
import { cn } from "@/lib/utils"
import type { CatalogMovie, ItemNeighbors } from "@/lib/recommender"
import { posterUrl, imdbUrl, useOverview, loadCatalog, loadNeighborTable, similarTo } from "@/lib/recommender"

interface MovieCardProps {
  movie: CatalogMovie
  userRating?: number
  onRate?: (rating: number) => void
  onSkip?: () => void
  isWatchlisted?: boolean
  onToggleWatchlist?: () => void
  because?: string[]
}

export default function MovieCard({
  movie,
  userRating,
  onRate,
  onSkip,
  isWatchlisted,
  onToggleWatchlist,
  because,
}: MovieCardProps) {
  const poster = posterUrl(movie.posterPath)
  const overview = useOverview(movie.index)
  const [detailOpen, setDetailOpen] = useState(false)

  return (
    <Card className="overflow-hidden transition-all hover:shadow-lg flex flex-col">
      <div className="relative aspect-[2/3] w-full overflow-hidden bg-muted">
        <button
          type="button"
          onClick={() => setDetailOpen(true)}
          className="absolute inset-0 block h-full w-full"
          aria-label={`View details for ${movie.title}`}
        >
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
        </button>
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
      <MovieDetailDialog
        movie={movie}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        overview={overview}
        userRating={userRating}
        onRate={onRate}
      />
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
        {overview && (
          <button
            type="button"
            onClick={() => setDetailOpen(true)}
            className="mb-2 block text-left text-sm text-muted-foreground line-clamp-3 hover:text-foreground"
          >
            {overview}
          </button>
        )}
        <div className="flex flex-wrap gap-1 mb-2">
          {movie.genres.slice(0, 3).map((g) => (
            <Badge key={g} variant="outline" className="text-xs">
              {g}
            </Badge>
          ))}
        </div>
        <Dialog>
          <DialogTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <Sparkles className="h-3.5 w-3.5" />
              More like this
            </button>
          </DialogTrigger>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>More like {movie.title}</DialogTitle>
              <DialogDescription>Films whose audiences overlap most with this one.</DialogDescription>
            </DialogHeader>
            <SimilarMovies movie={movie} />
          </DialogContent>
        </Dialog>
      </CardContent>
      {(onRate || onSkip || onToggleWatchlist) && (
        <CardFooter className="px-4 pb-4 pt-0 flex items-center justify-between gap-2">
          <StarRating value={userRating ?? 0} size="sm" onChange={onRate} />
          <div className="flex items-center gap-3">
            {onToggleWatchlist && (
              <button
                type="button"
                onClick={onToggleWatchlist}
                className={cn(
                  "flex items-center gap-1 text-xs hover:text-foreground",
                  isWatchlisted ? "text-foreground" : "text-muted-foreground",
                )}
                aria-label={isWatchlisted ? `Remove ${movie.title} from your watchlist` : `Add ${movie.title} to your watchlist`}
              >
                <Bookmark className={cn("h-3.5 w-3.5", isWatchlisted && "fill-current")} />
              </button>
            )}
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
          </div>
        </CardFooter>
      )}
    </Card>
  )
}

function SimilarMovies({ movie }: { movie: CatalogMovie }) {
  const { profile, rateMovie, skipMovie, watchlistMovie, unwatchlistMovie } = useProfile()
  const [catalog, setCatalog] = useState<CatalogMovie[] | null>(null)
  const [neighbors, setNeighbors] = useState<ItemNeighbors | null>(null)

  useEffect(() => {
    loadCatalog().then(setCatalog)
    loadNeighborTable().then(setNeighbors)
  }, [])

  const catalogById = useMemo(() => new Map(catalog?.map((m) => [m.movieId, m])), [catalog])

  if (!catalog || !neighbors) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const similarMovies = similarTo(movie.index, neighbors, catalog, 9)
    .map((s) => catalogById.get(s.movieId))
    .filter((m): m is CatalogMovie => Boolean(m))

  if (similarMovies.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Not enough ratings on this title yet to find similar films.
      </p>
    )
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
      {similarMovies.map((m) => (
        <MovieCard
          key={m.movieId}
          movie={m}
          userRating={profile?.ratings[m.movieId]}
          because={[movie.title]}
          onRate={(rating) => rateMovie(m.movieId, rating)}
          onSkip={() => skipMovie(m.movieId)}
          isWatchlisted={profile?.watchlist.includes(m.movieId)}
          onToggleWatchlist={() =>
            profile?.watchlist.includes(m.movieId) ? unwatchlistMovie(m.movieId) : watchlistMovie(m.movieId)
          }
        />
      ))}
    </div>
  )
}
