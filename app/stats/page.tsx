"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Loader2 } from "lucide-react"
import { signIn } from "next-auth/react"
import { useProfile } from "@/contexts/profile-context"
import { ActivityChart } from "@/components/stats/activity-chart"
import { DecadeChart } from "@/components/stats/decade-chart"
import { GenreComparisonChart } from "@/components/stats/genre-comparison-chart"
import { RatingHistogramChart } from "@/components/stats/rating-histogram-chart"
import { StatTile } from "@/components/stats/stat-tile"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { loadCatalog, loadPopulation, MIN_RATINGS_FOR_CF, type CatalogMovie, type PopulationStats } from "@/lib/recommender"
import { activityByMonth, biggestGenreGap, decadeCounts, genreShares, ratingHistogram, type RatedEntry } from "@/lib/stats"

export default function StatsPage() {
  const { profile, isLoading: profileLoading, ratingCount } = useProfile()

  const [catalog, setCatalog] = useState<CatalogMovie[] | null>(null)
  const [population, setPopulation] = useState<PopulationStats | null>(null)

  useEffect(() => {
    loadCatalog().then(setCatalog)
    loadPopulation().then(setPopulation)
  }, [])

  const catalogById = useMemo(() => {
    const map = new Map<number, CatalogMovie>()
    catalog?.forEach((m) => map.set(m.movieId, m))
    return map
  }, [catalog])

  const entries = useMemo<RatedEntry[]>(() => {
    if (!profile) return []
    return Object.entries(profile.ratings)
      .map(([movieId, rating]) => {
        const movie = catalogById.get(Number(movieId))
        if (!movie) return null
        return { movie, rating, ratedAt: profile.ratedAt[movieId] ?? new Date(0).toISOString() }
      })
      .filter((e): e is RatedEntry => e !== null)
  }, [profile, catalogById])

  if (profileLoading || !catalog || !population) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="container mx-auto max-w-md px-4 py-20 text-center">
        <h1 className="text-2xl font-bold mb-2">Sign in to see your taste profile</h1>
        <p className="text-muted-foreground mb-6">Rate a few films and see how your taste compares.</p>
        <Button onClick={() => signIn("google")}>Sign in with Google</Button>
      </div>
    )
  }

  if (ratingCount < MIN_RATINGS_FOR_CF) {
    return (
      <div className="container mx-auto max-w-md px-4 py-20 text-center">
        <h1 className="text-2xl font-bold mb-2">Not enough ratings yet</h1>
        <p className="text-muted-foreground mb-6">
          Rate a few more films to unlock your taste profile ({ratingCount}/{MIN_RATINGS_FOR_CF} so far).
        </p>
        <div className="mx-auto mb-6 max-w-xs">
          <Progress value={(ratingCount / MIN_RATINGS_FOR_CF) * 100} />
        </div>
        <Button asChild>
          <Link href="/">Rate some movies</Link>
        </Button>
      </div>
    )
  }

  const genreData = Object.entries(genreShares(entries))
    .map(([genre, you]) => ({
      genre,
      you,
      population: (population.genres[genre] ?? 0) / population.totalGenreWeight,
    }))
    .sort((a, b) => b.you - a.you)
    .slice(0, 8)

  const decadeData = Object.entries(decadeCounts(entries))
    .map(([decade, count]) => ({ decadeNum: Number(decade), decade: `${decade}s`, count }))
    .sort((a, b) => a.decadeNum - b.decadeNum)
    .map(({ decade, count }) => ({ decade, count }))

  const histogramData = ratingHistogram(entries)
  const activityData = activityByMonth(entries)
  const gap = biggestGenreGap(entries, population)

  const averageRating = entries.reduce((sum, e) => sum + e.rating, 0) / entries.length
  const loved = entries.filter((e) => e.rating >= 4.5).length
  const decadesSpanned = Object.keys(decadeCounts(entries)).length

  return (
    <div className="container mx-auto px-4 py-10">
      <h1 className="mb-1 text-3xl font-bold tracking-tight">Your Taste Profile</h1>
      <p className="mb-8 text-muted-foreground">How your ratings compare to the wider MovieLens audience.</p>

      {gap && (
        <Card className="mb-8 border-primary/20 bg-muted/40">
          <CardContent className="p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Standout</p>
            <p className="mt-1 text-lg font-medium">
              You rate {gap.genre} films {gap.ratio.toFixed(1)}× more than the typical MovieLens viewer.
            </p>
          </CardContent>
        </Card>
      )}

      <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatTile label="Films rated" value={String(entries.length)} />
        <StatTile label="Average rating" value={`${averageRating.toFixed(2)}★`} />
        <StatTile label="Loved (4.5★+)" value={String(loved)} />
        <StatTile label="Decades spanned" value={String(decadesSpanned)} />
      </div>

      <div className="mb-6">
        <GenreComparisonChart data={genreData} />
      </div>

      <div className="mb-6 grid gap-6 md:grid-cols-2">
        <RatingHistogramChart data={histogramData} />
        <DecadeChart data={decadeData} />
      </div>

      <ActivityChart data={activityData} />
    </div>
  )
}
