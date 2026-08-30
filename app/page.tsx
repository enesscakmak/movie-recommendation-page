import MovieGrid from "@/components/movie-grid"
import type { MovieData } from "@/types/movie"

// Sample movie data - in a real app, this would come from your ML backend
const recommendedMovies: MovieData[] = [
  {
    id: 1,
    title: "Inception",
    description:
      "A thief who steals corporate secrets through the use of dream-sharing technology is given the inverse task of planting an idea into the mind of a C.E.O.",
    image: "/placeholder.svg?height=450&width=300",
    rating: 8.8,
    year: 2010,
    genre: "Sci-Fi",
  },
  {
    id: 2,
    title: "The Shawshank Redemption",
    description:
      "Two imprisoned men bond over a number of years, finding solace and eventual redemption through acts of common decency.",
    image: "/placeholder.svg?height=450&width=300",
    rating: 9.3,
    year: 1994,
    genre: "Drama",
  },
  {
    id: 3,
    title: "The Dark Knight",
    description:
      "When the menace known as the Joker wreaks havoc and chaos on the people of Gotham, Batman must accept one of the greatest psychological and physical tests of his ability to fight injustice.",
    image: "/placeholder.svg?height=450&width=300",
    rating: 9.0,
    year: 2008,
    genre: "Action",
  },
  {
    id: 4,
    title: "Pulp Fiction",
    description:
      "The lives of two mob hitmen, a boxer, a gangster and his wife, and a pair of diner bandits intertwine in four tales of violence and redemption.",
    image: "/placeholder.svg?height=450&width=300",
    rating: 8.9,
    year: 1994,
    genre: "Crime",
  },
  {
    id: 5,
    title: "The Matrix",
    description:
      "A computer hacker learns from mysterious rebels about the true nature of his reality and his role in the war against its controllers.",
    image: "/placeholder.svg?height=450&width=300",
    rating: 8.7,
    year: 1999,
    genre: "Sci-Fi",
  },
  {
    id: 6,
    title: "Goodfellas",
    description:
      "The story of Henry Hill and his life in the mob, covering his relationship with his wife Karen Hill and his mob partners Jimmy Conway and Tommy DeVito.",
    image: "/placeholder.svg?height=450&width=300",
    rating: 8.7,
    year: 1990,
    genre: "Crime",
  },
  {
    id: 7,
    title: "Interstellar",
    description: "A team of explorers travel through a wormhole in space in an attempt to ensure humanity's survival.",
    image: "/placeholder.svg?height=450&width=300",
    rating: 8.6,
    year: 2014,
    genre: "Sci-Fi",
  },
  {
    id: 8,
    title: "Parasite",
    description:
      "Greed and class discrimination threaten the newly formed symbiotic relationship between the wealthy Park family and the destitute Kim clan.",
    image: "/placeholder.svg?height=450&width=300",
    rating: 8.6,
    year: 2019,
    genre: "Thriller",
  },
]

export default function Home() {
  return (
    <main className="container mx-auto px-4 py-8">
      <section className="mb-10">
        <h1 className="text-4xl font-bold mb-2">Your Movie Recommendations</h1>
        <p className="text-muted-foreground">Based on your ratings, we think you'll enjoy these films</p>
      </section>

      <MovieGrid movies={recommendedMovies} />
    </main>
  )
}

