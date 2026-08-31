
const enc = new TextEncoder()

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
  if (actual.length !== expected.length) return false
  let diff = 0
  for (let i = 0; i < actual.length; i++) diff |= actual.charCodeAt(i) ^ expected.charCodeAt(i)
  return diff === 0
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")
}
