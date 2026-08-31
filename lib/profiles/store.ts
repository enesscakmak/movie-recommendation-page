
import { LEGACY_MOCK_KEY, STORAGE_KEY, emptyDb, migrate, type StoredDb } from "./schema"

function available(): boolean {
  try {
    if (typeof window === "undefined" || !window.localStorage) return false
    const probe = "__moviemind_probe__"
    window.localStorage.setItem(probe, "1")
    window.localStorage.removeItem(probe)
    return true
  } catch {
    return false
  }
}

export function readDbSync(): StoredDb {
  if (!available()) return emptyDb()
  try {
    window.localStorage.removeItem(LEGACY_MOCK_KEY)

    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return emptyDb()

    return migrate(JSON.parse(raw), (payload) => {
      try {
        window.localStorage.setItem(`${STORAGE_KEY}.backup.${Date.now()}`, payload)
      } catch {
      }
    })
  } catch {
    return emptyDb()
  }
}

export async function getDb(): Promise<StoredDb> {
  return readDbSync()
}

export async function saveDb(db: StoredDb): Promise<void> {
  if (!available()) return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(db))
  } catch {
  }
}

export function exportProfile(db: StoredDb, profileId: string): string {
  const profile = db.profiles.find((p) => p.id === profileId)
  if (!profile) throw new Error("No such profile")
  const { salt: _salt, passwordHash: _hash, ...rest } = profile
  return JSON.stringify({ schemaVersion: db.schemaVersion, profile: rest }, null, 2)
}
