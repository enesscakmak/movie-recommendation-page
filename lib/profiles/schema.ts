
export const STORAGE_KEY = "moviemind.db"
export const SCHEMA_VERSION = 1

export const LEGACY_MOCK_KEY = "user"

export interface StoredProfile {
  id: string
  username: string
  displayName: string
  salt: string | null
  passwordHash: string | null
  createdAt: string
  ratings: Record<string, number>
  ratedAt: Record<string, string>
  skipped: number[]
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
