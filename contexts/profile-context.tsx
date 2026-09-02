"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { useSession, signOut as nextAuthSignOut } from "next-auth/react"
import { toast } from "sonner"

export interface ProfileState {
  ratings: Record<string, number>
  ratedAt: Record<string, string>
  skipped: number[]
  watchlist: number[]
  recommendationOffset: number
}

interface ProfileContextValue {
  profile: ProfileState | null
  isLoading: boolean
  signOut: () => void
  rateMovie: (movieId: number, rating: number) => void
  skipMovie: (movieId: number) => void
  unskipMovie: (movieId: number) => void
  watchlistMovie: (movieId: number) => void
  unwatchlistMovie: (movieId: number) => void
  advanceRecommendations: () => void
  ratingCount: number
}

const ProfileContext = createContext<ProfileContextValue | undefined>(undefined)

function emptyState(): ProfileState {
  return { ratings: {}, ratedAt: {}, skipped: [], watchlist: [], recommendationOffset: 0 }
}

export function ProfileProvider({ children }: { children: ReactNode }) {
  const { status } = useSession()
  const [state, setState] = useState<ProfileState | null>(null)
  const stateRef = useRef<ProfileState | null>(state)
  stateRef.current = state

  useEffect(() => {
    if (status !== "authenticated") {
      setState(null)
      return
    }
    let cancelled = false
    fetch("/api/ratings")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load ratings")
        return res.json() as Promise<{
          ratings: Record<string, number>
          ratedAt: Record<string, string>
          skipped: number[]
          watchlist: number[]
        }>
      })
      .then((data) => {
        if (!cancelled) setState({ ...data, recommendationOffset: 0 })
      })
      .catch(() => {
        if (!cancelled) {
          setState(emptyState())
          toast.error("Couldn't load your ratings.")
        }
      })
    return () => {
      cancelled = true
    }
  }, [status])

  const commit = useCallback((fn: (current: ProfileState) => ProfileState) => {
    setState((current) => fn(current ?? emptyState()))
  }, [])

  const rateMovie = useCallback(
    (movieId: number, rating: number) => {
      commit((p) => {
        const ratings = { ...p.ratings }
        const ratedAt = { ...p.ratedAt }
        if (rating > 0) {
          ratings[movieId] = rating
          ratedAt[movieId] = new Date().toISOString()
        } else {
          delete ratings[movieId]
          delete ratedAt[movieId]
        }
        return {
          ...p,
          ratings,
          ratedAt,
          skipped: p.skipped.filter((id) => id !== movieId),
          watchlist: p.watchlist.filter((id) => id !== movieId),
          recommendationOffset: 0,
        }
      })

      fetch("/api/ratings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ movieId, rating }),
      }).catch(() => toast.error("Couldn't save that rating - try again."))
    },
    [commit],
  )

  const skipMovie = useCallback(
    (movieId: number) => {
      commit((p) => {
        if (p.skipped.includes(movieId)) return p
        const ratings = { ...p.ratings }
        const ratedAt = { ...p.ratedAt }
        delete ratings[movieId]
        delete ratedAt[movieId]
        return {
          ...p,
          ratings,
          ratedAt,
          skipped: [...p.skipped, movieId],
          watchlist: p.watchlist.filter((id) => id !== movieId),
          recommendationOffset: 0,
        }
      })

      fetch("/api/skips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ movieId }),
      }).catch(() => toast.error("Couldn't save that - try again."))
    },
    [commit],
  )

  const unskipMovie = useCallback(
    (movieId: number) => {
      commit((p) => ({ ...p, skipped: p.skipped.filter((id) => id !== movieId) }))

      fetch("/api/skips", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ movieId }),
      }).catch(() => toast.error("Couldn't update that - try again."))
    },
    [commit],
  )

  const watchlistMovie = useCallback(
    (movieId: number) => {
      commit((p) => {
        if (p.watchlist.includes(movieId)) return p
        const ratings = { ...p.ratings }
        const ratedAt = { ...p.ratedAt }
        delete ratings[movieId]
        delete ratedAt[movieId]
        return {
          ...p,
          ratings,
          ratedAt,
          skipped: p.skipped.filter((id) => id !== movieId),
          watchlist: [...p.watchlist, movieId],
          recommendationOffset: 0,
        }
      })

      fetch("/api/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ movieId }),
      }).catch(() => toast.error("Couldn't save that - try again."))
    },
    [commit],
  )

  const unwatchlistMovie = useCallback(
    (movieId: number) => {
      commit((p) => ({ ...p, watchlist: p.watchlist.filter((id) => id !== movieId) }))

      fetch("/api/watchlist", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ movieId }),
      }).catch(() => toast.error("Couldn't update that - try again."))
    },
    [commit],
  )

  const advanceRecommendations = useCallback(() => {
    commit((p) => ({ ...p, recommendationOffset: p.recommendationOffset + 1 }))
  }, [commit])

  const value = useMemo<ProfileContextValue>(
    () => ({
      profile: status === "authenticated" ? (state ?? emptyState()) : null,
      isLoading: status === "loading" || (status === "authenticated" && state === null),
      signOut: () => void nextAuthSignOut(),
      rateMovie,
      skipMovie,
      unskipMovie,
      watchlistMovie,
      unwatchlistMovie,
      advanceRecommendations,
      ratingCount: state ? Object.keys(state.ratings).length : 0,
    }),
    [status, state, rateMovie, skipMovie, unskipMovie, watchlistMovie, unwatchlistMovie, advanceRecommendations],
  )

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>
}

export function useProfile(): ProfileContextValue {
  const ctx = useContext(ProfileContext)
  if (ctx === undefined) throw new Error("useProfile must be used within a ProfileProvider")
  return ctx
}
