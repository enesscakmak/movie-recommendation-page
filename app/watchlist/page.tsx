"use client"

import { useEffect, useMemo, useState } from "react"
import { Loader2 } from "lucide-react"
import { signIn } from "next-auth/react"
import { useProfile } from "@/contexts/profile-context"
import { WatchlistMovieList } from "@/components/rating/watchlist-movie-list"
import { SkippedMovieList } from "@/components/rating/skipped-movie-list"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { loadCatalog, type CatalogMovie } from "@/lib/recommender"

export default function WatchlistPage() {
  const { profile, isLoading: profileLoading, rateMovie, unwatchlistMovie, unskipMovie } = useProfile()

  const [catalog, setCatalog] = useState<CatalogMovie[] | null>(null)

  useEffect(() => {
    loadCatalog().then(setCatalog)
  }, [])

  const catalogById = useMemo(() => {
    const map = new Map<number, CatalogMovie>()
    catalog?.forEach((m) => map.set(m.movieId, m))
    return map
  }, [catalog])

  const watchlistMovies = useMemo<CatalogMovie[]>(() => {
    if (!profile) return []
    return profile.watchlist.map((id) => catalogById.get(id)).filter((m): m is CatalogMovie => Boolean(m))
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
        <h1 className="text-2xl font-bold mb-2">Sign in to see your watchlist</h1>
        <p className="text-muted-foreground mb-6">
          Films you bookmark to watch later, and films you&apos;ve flagged as unwatched, are saved to your account.
        </p>
        <Button onClick={() => signIn("google")}>Sign in with Google</Button>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-10 max-w-3xl">
      <h1 className="text-3xl font-bold tracking-tight mb-1">Watchlist</h1>
      <p className="text-muted-foreground mb-8">Films saved to watch later, and films you&apos;ve flagged as unwatched.</p>

      <Tabs defaultValue="watchlist">
        <TabsList>
          <TabsTrigger value="watchlist">Watchlist</TabsTrigger>
          <TabsTrigger value="didnt-watch">Didn&apos;t Watch</TabsTrigger>
        </TabsList>

        <TabsContent value="watchlist" className="pt-4">
          <WatchlistMovieList movies={watchlistMovies} onRate={rateMovie} onRemove={unwatchlistMovie} />
        </TabsContent>

        <TabsContent value="didnt-watch" className="pt-4">
          <SkippedMovieList movies={skippedMovies} onRate={rateMovie} onUnskip={unskipMovie} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
