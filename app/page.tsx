"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Loader2, RefreshCw, Star } from "lucide-react"
import MovieGrid from "@/components/movie-grid"
import { FilterBar, EMPTY_FILTER_STATE, isFilterStateActive, type FilterState } from "@/components/discovery/filter-bar"
import { MovieSearch } from "@/components/rating/movie-search"
import { StarRating } from "@/components/rating/star-rating"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { useProfile } from "@/contexts/profile-context"
import {
  loadCatalog,
  loadNeighborTable,
  popularMovies,
  recommend,
  type CatalogMovie,
  type DiscoveryFilter,
  type ItemNeighbors,
  type Recommendation,
  type UserRating,
  MIN_RATINGS_FOR_CF,
  IDEAL_RATINGS,
  CURATED_HOME_IDS,
} from "@/lib/recommender"

export default function Home() {
  const {
    profile,
    isLoading: profileLoading,
    rateMovie,
    skipMovie,
    watchlistMovie,
    unwatchlistMovie,
    advanceRecommendations,
    ratingCount,
  } = useProfile()

  const [catalog, setCatalog] = useState<CatalogMovie[] | null>(null)
  const [neighbors, setNeighbors] = useState<ItemNeighbors | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [searchSelected, setSearchSelected] = useState<CatalogMovie | null>(null)
  const [filterState, setFilterState] = useState<FilterState>(EMPTY_FILTER_STATE)

  useEffect(() => {
    loadCatalog()
      .then(setCatalog)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load the catalogue."))
  }, [])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const genres = params.get("genres")
    const decade = params.get("decade")
    const minRating = params.get("minRating")
    const initial: FilterState = {
      genres: genres ? genres.split(",").filter(Boolean) : [],
      decade: decade ? Number(decade) : null,
      minRating: minRating ? Number(minRating) : 0,
    }
    if (isFilterStateActive(initial)) setFilterState(initial)
  }, [])

  useEffect(() => {
    const params = new URLSearchParams()
    if (filterState.genres.length > 0) params.set("genres", filterState.genres.join(","))
    if (filterState.decade !== null) params.set("decade", String(filterState.decade))
    if (filterState.minRating > 0) params.set("minRating", String(filterState.minRating))
    const qs = params.toString()
    window.history.replaceState(null, "", qs ? `${window.location.pathname}?${qs}` : window.location.pathname)
  }, [filterState])

  const discoveryFilter = useMemo<DiscoveryFilter | undefined>(() => {
    if (!isFilterStateActive(filterState)) return undefined
    return {
      genres: filterState.genres,
      minYear: filterState.decade !== null ? filterState.decade : undefined,
      maxYear: filterState.decade !== null ? filterState.decade + 9 : undefined,
      minMeanRating: filterState.minRating > 0 ? filterState.minRating : undefined,
    }
  }, [filterState])

  const personalizing = ratingCount >= MIN_RATINGS_FOR_CF
  useEffect(() => {
    if (!personalizing || neighbors) return
    loadNeighborTable()
      .then(setNeighbors)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load the recommender."))
  }, [personalizing, neighbors])

  const userRatings = useMemo<UserRating[]>(() => {
    if (!profile) return []
    return Object.entries(profile.ratings).map(([movieId, rating]) => ({
      movieId: Number(movieId),
      rating,
      ratedAt: profile.ratedAt[movieId] ?? new Date(0).toISOString(),
    }))
  }, [profile])

  const recs = useMemo<Recommendation[] | null>(() => {
    if (!catalog || !neighbors || !personalizing) return null
    return recommend(userRatings, profile?.skipped ?? [], neighbors, catalog, {
      count: 12,
      offset: profile?.recommendationOffset ?? 0,
      filter: discoveryFilter,
    })
  }, [catalog, neighbors, personalizing, userRatings, profile?.skipped, profile?.recommendationOffset, discoveryFilter])

  const catalogById = useMemo(() => {
    const map = new Map<number, CatalogMovie>()
    catalog?.forEach((m) => map.set(m.movieId, m))
    return map
  }, [catalog])

  const excludeIds = useMemo(() => {
    const ids = new Set<number>(profile?.skipped ?? [])
    if (profile) {
      Object.keys(profile.ratings).forEach((id) => ids.add(Number(id)))
      profile.watchlist.forEach((id) => ids.add(id))
    }
    return ids
  }, [profile])

  const watchlistSet = useMemo(() => new Set(profile?.watchlist ?? []), [profile])

  const ratedIds = useMemo(() => new Set(Object.keys(profile?.ratings ?? {}).map(Number)), [profile])

  const popular = useMemo(() => {
    if (!catalog || personalizing) return []
    return popularMovies(catalog, { count: 12, excludeIds, curatedIds: CURATED_HOME_IDS, filter: discoveryFilter })
  }, [catalog, personalizing, excludeIds, discoveryFilter])

  if (error) {
    return (
      <div className="container mx-auto px-4 py-16 text-center">
        <p className="text-destructive">{error}</p>
      </div>
    )
  }

  if (!catalog || profileLoading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const displayMovies = personalizing
    ? (recs ?? []).map((r) => catalogById.get(r.movieId)).filter((m): m is CatalogMovie => Boolean(m))
    : popular

  const becauseMap: Record<number, string[]> = {}
  if (personalizing && recs) {
    for (const r of recs) {
      becauseMap[r.movieId] = r.because.map((id) => catalogById.get(id)?.title).filter((t): t is string => Boolean(t))
    }
  }

  return (
    <div className="container mx-auto px-4 py-10">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            {personalizing ? "Recommended for you" : "Popular right now"}
          </h1>
          <p className="text-muted-foreground mt-1">
            {personalizing
              ? "Based on films similar to what you rated highly."
              : `Rate a few movies to unlock personalised picks (${ratingCount}/${MIN_RATINGS_FOR_CF} so far).`}
          </p>
        </div>
        {personalizing ? (
          <Button variant="outline" onClick={advanceRecommendations} disabled={!neighbors}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        ) : (
          <Button asChild>
            <Link href="/rated">
              <Star className="mr-2 h-4 w-4" />
              Rated Movies
            </Link>
          </Button>
        )}
      </div>

      {!personalizing && ratingCount > 0 && (
        <div className="mb-8 max-w-sm">
          <Progress value={(ratingCount / MIN_RATINGS_FOR_CF) * 100} />
        </div>
      )}

      <div className="mb-8 max-w-xl">
        <MovieSearch catalog={catalog} onMovieSelect={setSearchSelected} ratedIds={ratedIds} />
        {searchSelected && (
          <Card className="mt-4">
            <CardContent className="flex items-center justify-between gap-4 pt-6">
              <div>
                <div className="font-medium">{searchSelected.title}</div>
                <div className="text-sm text-muted-foreground">{searchSelected.year}</div>
              </div>
              <StarRating
                value={profile?.ratings[searchSelected.movieId] ?? 0}
                onChange={(rating) => {
                  rateMovie(searchSelected.movieId, rating)
                  setSearchSelected(null)
                }}
              />
            </CardContent>
          </Card>
        )}
      </div>

      <FilterBar catalog={catalog} value={filterState} onChange={setFilterState} />

      {personalizing && !neighbors ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : displayMovies.length === 0 ? (
        <div className="py-16 text-center space-y-3">
          <p className="text-muted-foreground">
            {isFilterStateActive(filterState)
              ? "No movies match these filters."
              : personalizing
                ? "No recommendations cleared the bar yet - try rating a few more films, ideally outside one genre."
                : "Nothing to show."}
          </p>
          {isFilterStateActive(filterState) && (
            <Button variant="outline" size="sm" onClick={() => setFilterState(EMPTY_FILTER_STATE)}>
              Clear filters
            </Button>
          )}
        </div>
      ) : (
        <MovieGrid
          movies={displayMovies}
          ratings={profile?.ratings}
          because={becauseMap}
          watchlist={watchlistSet}
          onRate={(movieId, rating) => rateMovie(movieId, rating)}
          onSkip={(movieId) => skipMovie(movieId)}
          onToggleWatchlist={(movieId) =>
            watchlistSet.has(movieId) ? unwatchlistMovie(movieId) : watchlistMovie(movieId)
          }
        />
      )}

      {personalizing && recs && recs.length > 0 && (
        <p className="mt-6 text-xs text-muted-foreground">
          Rated {ratingCount} film{ratingCount === 1 ? "" : "s"} so far
          {ratingCount < IDEAL_RATINGS ? ` - a few more (~${IDEAL_RATINGS}) sharpens these further.` : "."}
        </p>
      )}
    </div>
  )
}
