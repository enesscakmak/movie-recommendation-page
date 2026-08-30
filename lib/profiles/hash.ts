// Password hashing for local profiles.
//
// Read this before assuming it protects anything: it does not. The hash is
// stored in the same localStorage as the data it "guards", on the same
// machine, in a page with no server behind it. Anyone with the browser open
// can read or edit it directly.
//
// It exists because the Java original had a login screen (with an unsalted
// SHA-256 in users.json) and the port keeps that shape. Salting is a strict
// improvement over the original at zero cost, so we salt. Passwords are
// optional and off by default, and the UI says plainly what this is.

const enc = new TextEncoder()

/** SubtleCrypto needs a secure context: https, or localhost. */
export function canHash(): boolean {
  return typeof crypto !== "undefined" && typeof crypto.subtle !== "undefined"
}

export function newSalt(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return toHex(bytes)
}

export async function hashPassword(password: string, saltHex: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(`${saltHex}:${password}`))
  return toHex(new Uint8Array(digest))
}

export async function verifyPassword(password: string, saltHex: string, expected: string): Promise<boolean> {
  const actual = await hashPassword(password, saltHex)
  // Constant-time-ish. Not that it matters here, but it costs one line.
  if (actual.length !== expected.length) return false
  let diff = 0
  for (let i = 0; i < actual.length; i++) diff |= actual.charCodeAt(i) ^ expected.charCodeAt(i)
  return diff === 0
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")
}
