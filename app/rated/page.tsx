"use client"

import { useEffect, useMemo, useState } from "react"
import { Loader2 } from "lucide-react"
import { signIn } from "next-auth/react"
import { useProfile } from "@/contexts/profile-context"
import { MovieSearch } from "@/components/rating/movie-search"
import { StarRating } from "@/components/rating/star-rating"
import { RatedMovieList, type RatedEntry } from "@/components/rating/rated-movie-list"
import { SkippedMovieList } from "@/components/rating/skipped-movie-list"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { loadCatalog, type CatalogMovie } from "@/lib/recommender"

export default function RatedMoviesPage() {
  const { profile, isLoading: profileLoading, rateMovie, unskipMovie } = useProfile()

  const [catalog, setCatalog] = useState<CatalogMovie[] | null>(null)
  const [selected, setSelected] = useState<CatalogMovie | null>(null)

  useEffect(() => {
    loadCatalog().then(setCatalog)
  }, [])

  const catalogById = useMemo(() => {
    const map = new Map<number, CatalogMovie>()
    catalog?.forEach((m) => map.set(m.movieId, m))
    return map
  }, [catalog])

  const ratedIds = useMemo(() => new Set(Object.keys(profile?.ratings ?? {}).map(Number)), [profile])

  const ratedEntries = useMemo<RatedEntry[]>(() => {
    if (!profile) return []
    return Object.entries(profile.ratings)
      .map(([movieId, rating]) => {
        const movie = catalogById.get(Number(movieId))
        if (!movie) return null
        return { movie, rating, ratedAt: profile.ratedAt[movieId] ?? new Date(0).toISOString() }
      })
      .filter((e): e is RatedEntry => e !== null)
  }, [profile, catalogById])

  const skippedMovies = useMemo<CatalogMovie[]>(() => {
    if (!profile) return []
    return profile.skipped.map((id) => catalogById.get(id)).filter((m): m is CatalogMovie => Boolean(m))
  }, [profile, catalogById])

  if (profileLoading || !catalog) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="container mx-auto max-w-md px-4 py-20 text-center">
        <h1 className="text-2xl font-bold mb-2">Sign in to see your ratings</h1>
        <p className="text-muted-foreground mb-6">Your ratings are saved to your account and follow you anywhere.</p>
        <Button onClick={() => signIn("google")}>Sign in with Google</Button>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-10 max-w-3xl">
      <h1 className="text-3xl font-bold tracking-tight mb-1">Rated Movies</h1>
      <p className="text-muted-foreground mb-8">
        Everything you&apos;ve rated, everything you&apos;ve flagged as unwatched, and a search to add more.
      </p>

      <Tabs defaultValue="ratings">
        <TabsList>
          <TabsTrigger value="ratings">Your Ratings</TabsTrigger>
          <TabsTrigger value="didnt-watch">Didn&apos;t Watch</TabsTrigger>
          <TabsTrigger value="search">Search</TabsTrigger>
        </TabsList>

        <TabsContent value="ratings" className="pt-4">
          <RatedMovieList ratings={ratedEntries} onRemoveRating={(movieId) => rateMovie(movieId, 0)} />
        </TabsContent>

        <TabsContent value="didnt-watch" className="pt-4">
          <SkippedMovieList movies={skippedMovies} onRate={rateMovie} onUnskip={unskipMovie} />
        </TabsContent>

        <TabsContent value="search" className="pt-4 space-y-4">
          <MovieSearch catalog={catalog} onMovieSelect={setSelected} ratedIds={ratedIds} />
          {selected && (
            <Card>
              <CardContent className="flex items-center justify-between gap-4 pt-6">
                <div>
                  <div className="font-medium">{selected.title}</div>
                  <div className="text-sm text-muted-foreground">{selected.year}</div>
                </div>
                <StarRating
                  value={profile.ratings[selected.movieId] ?? 0}
                  onChange={(rating) => {
                    rateMovie(selected.movieId, rating)
                    setSelected(null)
                  }}
                />
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
