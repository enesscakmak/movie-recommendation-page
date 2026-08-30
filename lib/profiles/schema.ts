// Storage schema for local profiles.
//
// The Java original kept accounts in a users.json next to the app. This is the
// honest web equivalent: everything lives in this one browser, and the UI says
// so out loud. There is no server and nothing to sign in to.

export const STORAGE_KEY = "moviemind.db"
export const SCHEMA_VERSION = 1

/** The key the v0 scaffold's mock auth left behind. Removed on migration. */
export const LEGACY_MOCK_KEY = "user"

export interface StoredProfile {
  id: string
  /** Unique within this browser; compared case-insensitively. */
  username: string
  displayName: string
  /** Both null when the profile has no password, which is the default. */
  salt: string | null
  passwordHash: string | null
  createdAt: string
  /** movieId -> 0.5..5 */
  ratings: Record<string, number>
  /** movieId -> ISO timestamp */
  ratedAt: Record<string, string>
  /** "Haven't seen it" - excluded from recommendations, like the original's DNW. */
  skipped: number[]
  /** Which page of the ranking the Refresh button is showing. */
  recommendationOffset: number
}

export interface StoredDb {
  schemaVersion: number
  profiles: StoredProfile[]
  activeProfileId: string | null
}

export function emptyDb(): StoredDb {
  return { schemaVersion: SCHEMA_VERSION, profiles: [], activeProfileId: null }
}

export function newProfile(input: {
  displayName: string
  username: string
  salt?: string | null
  passwordHash?: string | null
}): StoredProfile {
  return {
    id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `p-${Date.now()}-${Math.random()}`,
    username: input.username.trim(),
    displayName: input.displayName.trim() || input.username.trim(),
    salt: input.salt ?? null,
    passwordHash: input.passwordHash ?? null,
    createdAt: new Date().toISOString(),
    ratings: {},
    ratedAt: {},
    skipped: [],
    recommendationOffset: 0,
  }
}

function isProfile(v: unknown): v is StoredProfile {
  if (typeof v !== "object" || v === null) return false
  const p = v as Record<string, unknown>
  return typeof p.id === "string" && typeof p.username === "string"
}

/**
 * Bring stored data up to the current schema.
 *
 * An unreadable or newer-than-expected payload is set aside rather than thrown
 * away silently and rather than crashing the app: a visitor with a corrupt
 * localStorage should still get a working page.
 */
export function migrate(raw: unknown, onBackup?: (payload: string) => void): StoredDb {
  if (typeof raw !== "object" || raw === null) return emptyDb()
  const db = raw as Partial<StoredDb>

  if (typeof db.schemaVersion !== "number" || db.schemaVersion > SCHEMA_VERSION) {
    onBackup?.(JSON.stringify(raw))
    return emptyDb()
  }

  const profiles = Array.isArray(db.profiles) ? db.profiles.filter(isProfile) : []
  for (const p of profiles) {
    p.ratings ??= {}
    p.ratedAt ??= {}
    p.skipped ??= []
    p.recommendationOffset ??= 0
    p.salt ??= null
    p.passwordHash ??= null
  }

  const activeProfileId =
    typeof db.activeProfileId === "string" && profiles.some((p) => p.id === db.activeProfileId)
      ? db.activeProfileId
      : null

  return { schemaVersion: SCHEMA_VERSION, profiles, activeProfileId }
}

export function ratingCountOf(p: StoredProfile | null): number {
  return p ? Object.keys(p.ratings).length : 0
}
