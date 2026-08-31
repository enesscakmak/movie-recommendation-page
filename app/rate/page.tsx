"use client"

import { useEffect, useMemo, useState } from "react"
import { Loader2, SkipForward } from "lucide-react"
import { signIn } from "next-auth/react"
import { useProfile } from "@/contexts/profile-context"
import { MovieSearch } from "@/components/rating/movie-search"
import { StarRating } from "@/components/rating/star-rating"
import { RatedMovieList, type RatedEntry } from "@/components/rating/rated-movie-list"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { loadCatalog, loadMeta, posterUrl, imdbUrl, useOverview, type CatalogMovie } from "@/lib/recommender"

export default function RatePage() {
  const { profile, isLoading: profileLoading, rateMovie, skipMovie } = useProfile()

  const [catalog, setCatalog] = useState<CatalogMovie[] | null>(null)
  const [discoverPool, setDiscoverPool] = useState<number[] | null>(null)
  const [selected, setSelected] = useState<CatalogMovie | null>(null)

  useEffect(() => {
    loadCatalog().then(setCatalog)
    loadMeta().then((meta) => setDiscoverPool(meta.discoverPool))
  }, [])

  const catalogById = useMemo(() => {
    const map = new Map<number, CatalogMovie>()
    catalog?.forEach((m) => map.set(m.movieId, m))
    return map
  }, [catalog])

  const ratedIds = useMemo(() => new Set(Object.keys(profile?.ratings ?? {}).map(Number)), [profile])

  const currentDiscoverMovie = useMemo(() => {
    if (!discoverPool || !catalog || !profile) return null
    const skipped = new Set(profile.skipped)
    for (const id of discoverPool) {
      if (ratedIds.has(id) || skipped.has(id)) continue
      const m = catalogById.get(id)
      if (m) return m
    }
    return null
  }, [discoverPool, catalog, profile, ratedIds, catalogById])

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
        <h1 className="text-2xl font-bold mb-2">Sign in to start rating</h1>
        <p className="text-muted-foreground mb-6">Your ratings are saved to your account and follow you anywhere.</p>
        <Button onClick={() => signIn("google")}>Sign in with Google</Button>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-10 max-w-3xl">
      <h1 className="text-3xl font-bold tracking-tight mb-1">Rate Movies</h1>
      <p className="text-muted-foreground mb-8">
        The more you rate, the sharper your recommendations. Half-star clicks work too.
      </p>

      <Tabs defaultValue="discover">
        <TabsList>
          <TabsTrigger value="discover">Discover</TabsTrigger>
          <TabsTrigger value="search">Search</TabsTrigger>
        </TabsList>

        <TabsContent value="discover" className="pt-4">
          {currentDiscoverMovie ? (
            <DiscoverCard
              movie={currentDiscoverMovie}
              onRate={(rating) => rateMovie(currentDiscoverMovie.movieId, rating)}
              onSkip={() => skipMovie(currentDiscoverMovie.movieId)}
            />
          ) : (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                You&apos;ve been through the whole discover queue - use search to rate anything else.
              </CardContent>
            </Card>
          )}
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

      <div className="mt-10">
        <RatedMovieList ratings={ratedEntries} onRemoveRating={(movieId) => rateMovie(movieId, 0)} />
      </div>
    </div>
  )
}

function DiscoverCard({ movie, onRate, onSkip }: { movie: CatalogMovie; onRate: (rating: number) => void; onSkip: () => void }) {
  const poster = posterUrl(movie.posterPath, "w342")
  const overview = useOverview(movie.index)
  return (
    <Card className="overflow-hidden">
      <div className="grid sm:grid-cols-[200px_1fr]">
        <div className="relative aspect-[2/3] w-full bg-muted sm:aspect-auto">
          {poster ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={poster} alt={movie.title} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center p-4 text-center text-sm text-muted-foreground">
              {movie.title}
            </div>
          )}
        </div>
        <div className="flex flex-col">
          <CardHeader>
            <CardTitle>
              {movie.title} <span className="text-muted-foreground font-normal">({movie.year})</span>
            </CardTitle>
            <CardDescription>
              {movie.genres.join(", ") || "No genres listed"} ·{" "}
              <a href={imdbUrl(movie.imdbId)} target="_blank" rel="noopener noreferrer" className="underline">
                IMDb
              </a>
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1">
            <p className="text-sm text-muted-foreground line-clamp-4">{overview}</p>
          </CardContent>
          <CardFooter className="flex items-center justify-between">
            <StarRating value={0} onChange={onRate} size="lg" />
            <Button variant="ghost" onClick={onSkip}>
              <SkipForward className="mr-2 h-4 w-4" />
              Haven&apos;t seen it
            </Button>
          </CardFooter>
        </div>
      </div>
    </Card>
  )
}
