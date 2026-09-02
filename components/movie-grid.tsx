import MovieCard from "@/components/movie-card"
import type { CatalogMovie } from "@/lib/recommender"

interface MovieGridProps {
  movies: CatalogMovie[]
  ratings?: Record<number, number>
  because?: Record<number, string[]>
  watchlist?: Set<number>
  onRate?: (movieId: number, rating: number) => void
  onSkip?: (movieId: number) => void
  onToggleWatchlist?: (movieId: number) => void
}

export default function MovieGrid({ movies, ratings, because, watchlist, onRate, onSkip, onToggleWatchlist }: MovieGridProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
      {movies.map((movie) => (
        <MovieCard
          key={movie.movieId}
          movie={movie}
          userRating={ratings?.[movie.movieId]}
          because={because?.[movie.movieId]}
          onRate={onRate ? (rating) => onRate(movie.movieId, rating) : undefined}
          onSkip={onSkip ? () => onSkip(movie.movieId) : undefined}
          isWatchlisted={watchlist?.has(movie.movieId)}
          onToggleWatchlist={onToggleWatchlist ? () => onToggleWatchlist(movie.movieId) : undefined}
        />
      ))}
    </div>
  )
}
