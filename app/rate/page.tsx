"use client"

import { useState, useEffect } from "react"
import { useAuth } from "@/contexts/auth-context"
import { MovieSearch } from "@/components/rating/movie-search"
import { StarRating } from "@/components/rating/star-rating"
import { RatedMovieList } from "@/components/rating/rated-movie-list"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { AuthDialog } from "@/components/auth/auth-dialog"
import type { MovieData, MovieRating } from "@/types/movie"
import { Loader2 } from "lucide-react"

export default function RatePage() {
  const { user } = useAuth()
  const [selectedMovie, setSelectedMovie] = useState<MovieData | null>(null)
  const [currentRating, setCurrentRating] = useState(0)
  const [ratings, setRatings] = useState<MovieRating[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [authDialogOpen, setAuthDialogOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    // In a real app, you would fetch the user's ratings from your API
    const fetchRatings = async () => {
      setIsLoading(true)
      try {
        // Simulate API call
        await new Promise((resolve) => setTimeout(resolve, 1000))

        // Mock data
        if (user) {
          const mockRatings: MovieRating[] = [
            {
              movie: {
                id: 1,
                title: "Inception",
                description: "A thief who steals corporate secrets through the use of dream-sharing technology.",
                image: "/placeholder.svg?height=450&width=300",
                rating: 8.8,
                year: 2010,
                genre: "Sci-Fi",
              },
              rating: 5,
              ratedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
            },
            {
              movie: {
                id: 2,
                title: "The Dark Knight",
                description: "When the menace known as the Joker wreaks havoc and chaos on the people of Gotham.",
                image: "/placeholder.svg?height=450&width=300",
                rating: 9.0,
                year: 2008,
                genre: "Action",
              },
              rating: 4,
              ratedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
            },
          ]
          setRatings(mockRatings)
        } else {
          setRatings([])
        }
      } catch (error) {
        console.error("Error fetching ratings:", error)
      } finally {
        setIsLoading(false)
      }
    }

    fetchRatings()
  }, [user])

  const handleMovieSelect = (movie: MovieData) => {
    setSelectedMovie(movie)

    // Check if movie is already rated
    const existingRating = ratings.find((r) => r.movie.id === movie.id)
    setCurrentRating(existingRating ? existingRating.rating : 0)
  }

  const handleRatingChange = (rating: number) => {
    setCurrentRating(rating)
  }

  const handleSubmitRating = async () => {
    if (!user) {
      setAuthDialogOpen(true)
      return
    }

    if (!selectedMovie || currentRating === 0) return

    setIsSubmitting(true)
    try {
      // In a real app, you would call your API to save the rating
      await new Promise((resolve) => setTimeout(resolve, 800)) // Simulate API call

      // Update local state
      const existingIndex = ratings.findIndex((r) => r.movie.id === selectedMovie.id)

      if (existingIndex >= 0) {
        // Update existing rating
        const updatedRatings = [...ratings]
        updatedRatings[existingIndex] = {
          ...updatedRatings[existingIndex],
          rating: currentRating,
          ratedAt: new Date().toISOString(),
        }
        setRatings(updatedRatings)
      } else {
        // Add new rating
        setRatings([
          ...ratings,
          {
            movie: selectedMovie,
            rating: currentRating,
            ratedAt: new Date().toISOString(),
          },
        ])
      }

      // Reset form
      setSelectedMovie(null)
      setCurrentRating(0)
    } catch (error) {
      console.error("Error submitting rating:", error)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleRemoveRating = async (movieId: number) => {
    if (!user) return

    try {
      // In a real app, you would call your API to delete the rating
      await new Promise((resolve) => setTimeout(resolve, 500)) // Simulate API call

      // Update local state
      setRatings(ratings.filter((r) => r.movie.id !== movieId))
    } catch (error) {
      console.error("Error removing rating:", error)
    }
  }

  return (
    <main className="container mx-auto px-4 py-8">
      <div className="max-w-4xl mx-auto">
        <section className="mb-10">
          <h1 className="text-4xl font-bold mb-2">Rate Movies</h1>
          <p className="text-muted-foreground">Rate movies to get personalized recommendations based on your taste</p>
        </section>

        <Tabs defaultValue="rate" className="space-y-6">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="rate">Rate Movies</TabsTrigger>
            <TabsTrigger value="history">Your Ratings</TabsTrigger>
          </TabsList>

          <TabsContent value="rate" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Find a Movie to Rate</CardTitle>
                <CardDescription>Search for a movie you've watched to rate it</CardDescription>
              </CardHeader>
              <CardContent>
                <MovieSearch onMovieSelect={handleMovieSelect} />
              </CardContent>
            </Card>

            {selectedMovie && (
              <Card>
                <CardHeader>
                  <CardTitle>Rate This Movie</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-col sm:flex-row gap-6">
                    <div className="w-32 h-48 mx-auto sm:mx-0 flex-shrink-0 overflow-hidden rounded-md">
                      <img
                        src={selectedMovie.image || "/placeholder.svg"}
                        alt={selectedMovie.title}
                        className="h-full w-full object-cover"
                      />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-xl font-bold">{selectedMovie.title}</h3>
                      <p className="text-sm text-muted-foreground mb-2">
                        {selectedMovie.year} • {selectedMovie.genre}
                      </p>
                      <p className="text-sm mb-6">{selectedMovie.description}</p>

                      <div className="space-y-4">
                        <div>
                          <h4 className="text-sm font-medium mb-2">Your Rating</h4>
                          <StarRating initialRating={currentRating} onChange={handleRatingChange} size="lg" />
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
                <CardFooter className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setSelectedMovie(null)}>
                    Cancel
                  </Button>
                  <Button onClick={handleSubmitRating} disabled={currentRating === 0 || isSubmitting}>
                    {isSubmitting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      "Submit Rating"
                    )}
                  </Button>
                </CardFooter>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="history">
            {isLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle>Your Movie Ratings</CardTitle>
                  <CardDescription>
                    {user
                      ? `You have rated ${ratings.length} movie${ratings.length === 1 ? "" : "s"}`
                      : "Sign in to see your ratings"}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {user ? (
                    <RatedMovieList ratings={ratings} onRemoveRating={handleRemoveRating} />
                  ) : (
                    <div className="text-center py-8">
                      <p className="text-muted-foreground mb-4">You need to sign in to see and manage your ratings</p>
                      <Button onClick={() => setAuthDialogOpen(true)}>Sign In</Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>

      <AuthDialog mode="signin" isOpen={authDialogOpen} onClose={() => setAuthDialogOpen(false)} />
    </main>
  )
}

