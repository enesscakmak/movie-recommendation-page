// The only module that touches localStorage.
//
// The API is async even though localStorage is not. That is deliberate: a
// synchronous read at boot is what avoids a flash of signed-out state, but
// keeping the signature async means swapping in IndexedDB later - if profiles
// ever grow past what localStorage should hold - is a change to this one file
// and nothing else.
//
// A profile with a hundred ratings is about 4 KB. Five profiles is 20 KB
// against a 5 MB budget, so that day is a long way off.

import { LEGACY_MOCK_KEY, STORAGE_KEY, emptyDb, migrate, type StoredDb } from "./schema"

function available(): boolean {
  try {
    if (typeof window === "undefined" || !window.localStorage) return false
    // Safari in private mode throws on write rather than on access.
    const probe = "__moviemind_probe__"
    window.localStorage.setItem(probe, "1")
    window.localStorage.removeItem(probe)
    return true
  } catch {
    return false
  }
}

/** Read and migrate. Never throws - a broken store yields an empty one. */
export function readDbSync(): StoredDb {
  if (!available()) return emptyDb()
  try {
    // The v0 scaffold's mock auth wrote a "user" key. Nothing reads it now.
    window.localStorage.removeItem(LEGACY_MOCK_KEY)

    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return emptyDb()

    return migrate(JSON.parse(raw), (payload) => {
      try {
        window.localStorage.setItem(`${STORAGE_KEY}.backup.${Date.now()}`, payload)
      } catch {
        // Out of quota while trying to back up: dropping the backup beats
        // failing the read.
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
    // Quota exceeded, or storage disabled mid-session. The in-memory state
    // stays correct for this session; there is nothing useful to tell the
    // visitor beyond that their ratings may not persist.
  }
}

export function exportProfile(db: StoredDb, profileId: string): string {
  const profile = db.profiles.find((p) => p.id === profileId)
  if (!profile) throw new Error("No such profile")
  // Credentials are not part of an export - they are meaningless elsewhere.
  const { salt: _salt, passwordHash: _hash, ...rest } = profile
  return JSON.stringify({ schemaVersion: db.schemaVersion, profile: rest }, null, 2)
}
