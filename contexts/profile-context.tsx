"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react"

import { canHash, hashPassword, newSalt, verifyPassword } from "@/lib/profiles/hash"
import { emptyDb, newProfile, ratingCountOf, type StoredDb, type StoredProfile } from "@/lib/profiles/schema"
import { readDbSync, saveDb } from "@/lib/profiles/store"

export interface ProfileSummary {
  id: string
  username: string
  displayName: string
  hasPassword: boolean
  ratingCount: number
}

interface ProfileContextValue {
  profile: StoredProfile | null
  profiles: ProfileSummary[]
  /** True until localStorage has been read. Never branch on `profile` before this clears. */
  isLoading: boolean
  createProfile: (input: { displayName: string; username: string; password?: string }) => Promise<void>
  signIn: (username: string, password?: string) => Promise<void>
  signOut: () => void
  rateMovie: (movieId: number, rating: number) => void
  skipMovie: (movieId: number) => void
  unskipMovie: (movieId: number) => void
  resetRatings: () => void
  deleteProfile: (id: string) => void
  advanceRecommendations: () => void
  ratingCount: number
}

const ProfileContext = createContext<ProfileContextValue | undefined>(undefined)

const SAVE_DEBOUNCE_MS = 300

export function ProfileProvider({ children }: { children: ReactNode }) {
  const [db, setDb] = useState<StoredDb>(emptyDb)
  const [isLoading, setIsLoading] = useState(true)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Mirrors `db` so the async paths (hashing a password, then writing) read
  // current state rather than whatever was captured when they were created.
  const dbRef = useRef<StoredDb>(db)

  // localStorage is read here rather than during render. The prerendered HTML
  // has no profile and the client does; branching on that during the first
  // render pass is a hydration mismatch under static export.
  useEffect(() => {
    const loaded = readDbSync()
    dbRef.current = loaded
    setDb(loaded)
    setIsLoading(false)
  }, [])

  /** Apply an update and schedule a debounced write - the star widget fires on every click. */
  const commit = useCallback((fn: (current: StoredDb) => StoredDb) => {
    const next = fn(dbRef.current)
    if (next === dbRef.current) return
    dbRef.current = next
    setDb(next)
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => void saveDb(next), SAVE_DEBOUNCE_MS)
  }, [])

  // Flush any pending write on unmount rather than losing the last rating.
  useEffect(
    () => () => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current)
        void saveDb(dbRef.current)
      }
    },
    [],
  )

  const profile = useMemo(
    () => db.profiles.find((p) => p.id === db.activeProfileId) ?? null,
    [db.profiles, db.activeProfileId],
  )

  const updateActive = useCallback(
    (fn: (p: StoredProfile) => StoredProfile) => {
      commit((current) => {
        const active = current.profiles.find((p) => p.id === current.activeProfileId)
        if (!active) return current
        return { ...current, profiles: current.profiles.map((p) => (p.id === active.id ? fn(p) : p)) }
      })
    },
    [commit],
  )

  const createProfile = useCallback<ProfileContextValue["createProfile"]>(
    async ({ displayName, username, password }) => {
      const name = username.trim()
      if (!name) throw new Error("Pick a name for this profile.")
      if (dbRef.current.profiles.some((p) => p.username.toLowerCase() === name.toLowerCase())) {
        throw new Error(`The name "${name}" is already used in this browser.`)
      }

      let salt: string | null = null
      let passwordHash: string | null = null
      if (password && canHash()) {
        salt = newSalt()
        passwordHash = await hashPassword(password, salt)
      }

      const created = newProfile({ displayName, username: name, salt, passwordHash })
      commit((current) => ({
        ...current,
        profiles: [...current.profiles, created],
        activeProfileId: created.id,
      }))
    },
    [commit],
  )

  const signIn = useCallback<ProfileContextValue["signIn"]>(
    async (username, password) => {
      const target = dbRef.current.profiles.find(
        (p) => p.username.toLowerCase() === username.trim().toLowerCase(),
      )
      if (!target) throw new Error("No profile with that name in this browser.")

      if (target.passwordHash && target.salt) {
        if (!password) throw new Error("This profile has a password.")
        const okPassword = await verifyPassword(password, target.salt, target.passwordHash)
        if (!okPassword) throw new Error("That password does not match.")
      }

      commit((current) => ({ ...current, activeProfileId: target.id }))
    },
    [commit],
  )

  const signOut = useCallback(() => {
    commit((current) => ({ ...current, activeProfileId: null }))
  }, [commit])

  const rateMovie = useCallback(
    (movieId: number, rating: number) => {
      updateActive((p) => {
        const ratings = { ...p.ratings }
        const ratedAt = { ...p.ratedAt }
        if (rating > 0) {
          ratings[movieId] = rating
          ratedAt[movieId] = new Date().toISOString()
        } else {
          delete ratings[movieId]
          delete ratedAt[movieId]
        }
        // Any change to the ratings invalidates the current page of results.
        return { ...p, ratings, ratedAt, skipped: p.skipped.filter((id) => id !== movieId), recommendationOffset: 0 }
      })
    },
    [updateActive],
  )

  const skipMovie = useCallback(
    (movieId: number) => {
      updateActive((p) => {
        if (p.skipped.includes(movieId)) return p
        const ratings = { ...p.ratings }
        const ratedAt = { ...p.ratedAt }
        delete ratings[movieId]
        delete ratedAt[movieId]
        return { ...p, ratings, ratedAt, skipped: [...p.skipped, movieId], recommendationOffset: 0 }
      })
    },
    [updateActive],
  )

  const unskipMovie = useCallback(
    (movieId: number) => {
      updateActive((p) => ({ ...p, skipped: p.skipped.filter((id) => id !== movieId), recommendationOffset: 0 }))
    },
    [updateActive],
  )

  const resetRatings = useCallback(() => {
    updateActive((p) => ({ ...p, ratings: {}, ratedAt: {}, skipped: [], recommendationOffset: 0 }))
  }, [updateActive])

  const advanceRecommendations = useCallback(() => {
    updateActive((p) => ({ ...p, recommendationOffset: p.recommendationOffset + 1 }))
  }, [updateActive])

  const deleteProfile = useCallback(
    (id: string) => {
      commit((current) => ({
        ...current,
        profiles: current.profiles.filter((p) => p.id !== id),
        activeProfileId: current.activeProfileId === id ? null : current.activeProfileId,
      }))
    },
    [commit],
  )

  const profiles = useMemo<ProfileSummary[]>(
    () =>
      db.profiles.map((p) => ({
        id: p.id,
        username: p.username,
        displayName: p.displayName,
        hasPassword: Boolean(p.passwordHash),
        ratingCount: Object.keys(p.ratings).length,
      })),
    [db.profiles],
  )

  const value = useMemo<ProfileContextValue>(
    () => ({
      profile,
      profiles,
      isLoading,
      createProfile,
      signIn,
      signOut,
      rateMovie,
      skipMovie,
      unskipMovie,
      resetRatings,
      deleteProfile,
      advanceRecommendations,
      ratingCount: ratingCountOf(profile),
    }),
    [
      profile,
      profiles,
      isLoading,
      createProfile,
      signIn,
      signOut,
      rateMovie,
      skipMovie,
      unskipMovie,
      resetRatings,
      deleteProfile,
      advanceRecommendations,
    ],
  )

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>
}

export function useProfile(): ProfileContextValue {
  const ctx = useContext(ProfileContext)
  if (ctx === undefined) throw new Error("useProfile must be used within a ProfileProvider")
  return ctx
}
