export interface MovieData {
  id: number
  title: string
  description: string
  image: string
  rating: number
  year: number
  genre: string
}

export interface MovieRating {
  movie: MovieData
  rating: number
  ratedAt: string
}

