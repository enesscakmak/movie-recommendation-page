"use client"

import { useState, useEffect } from "react"
import { Input } from "@/components/ui/input"
import { Search, Loader2 } from "lucide-react"
import type { MovieData } from "@/types/movie"

interface MovieSearchProps {
  onMovieSelect: (movie: MovieData) => void
}

export function MovieSearch({ onMovieSelect }: MovieSearchProps) {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<MovieData[]>([])
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    const searchMovies = async () => {
      if (!query.trim()) {
        setResults([])
        return
      }

      setIsLoading(true)
      try {
        // In a real app, you would call your movie search API here
        // This is just a mock implementation
        await new Promise((resolve) => setTimeout(resolve, 800)) // Simulate API call

        // Mock search results
        const mockResults: MovieData[] = [
          {
            id: 1,
            title: "Inception",
            description: "A thief who steals corporate secrets through the use of dream-sharing technology.",
            image: "/placeholder.svg?height=450&width=300",
            rating: 8.8,
            year: 2010,
            genre: "Sci-Fi",
          },
          {
            id: 2,
            title: "The Dark Knight",
            description: "When the menace known as the Joker wreaks havoc and chaos on the people of Gotham.",
            image: "/placeholder.svg?height=450&width=300",
            rating: 9.0,
            year: 2008,
            genre: "Action",
          },
          {
            id: 3,
            title: "Interstellar",
            description:
              "A team of explorers travel through a wormhole in space in an attempt to ensure humanity's survival.",
            image: "/placeholder.svg?height=450&width=300",
            rating: 8.6,
            year: 2014,
            genre: "Sci-Fi",
          },
        ].filter((movie) => movie.title.toLowerCase().includes(query.toLowerCase()))

        setResults(mockResults)
      } catch (error) {
        console.error("Movie search error:", error)
      } finally {
        setIsLoading(false)
      }
    }

    const debounce = setTimeout(searchMovies, 500)
    return () => clearTimeout(debounce)
  }, [query])

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search for a movie..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      {isLoading && (
        <div className="flex justify-center py-4">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {!isLoading && results.length > 0 && (
        <div className="rounded-md border">
          {results.map((movie) => (
            <div
              key={movie.id}
              className="flex items-center gap-3 border-b p-3 last:border-0 hover:bg-muted/50 cursor-pointer"
              onClick={() => onMovieSelect(movie)}
            >
              <div className="h-12 w-8 overflow-hidden rounded">
                <img src={movie.image || "/placeholder.svg"} alt={movie.title} className="h-full w-full object-cover" />
              </div>
              <div className="flex-1">
                <h4 className="font-medium">{movie.title}</h4>
                <p className="text-xs text-muted-foreground">
                  {movie.year} • {movie.genre}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {!isLoading && query && results.length === 0 && (
        <div className="rounded-md border p-4 text-center text-muted-foreground">No movies found for "{query}"</div>
      )}
    </div>
  )
}

