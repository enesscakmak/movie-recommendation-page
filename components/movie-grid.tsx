import MovieCard from "@/components/movie-card"
import type { MovieData } from "@/types/movie"

interface MovieGridProps {
  movies: MovieData[]
}

export default function MovieGrid({ movies }: MovieGridProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
      {movies.map((movie) => (
        <MovieCard key={movie.id} movie={movie} />
      ))}
    </div>
  )
}

