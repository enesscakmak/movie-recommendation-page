import { NextResponse } from "next/server"
import { getCloudflareContext } from "@opennextjs/cloudflare"

import { auth } from "@/auth"
import { getRatingsPayload, setRating } from "@/lib/ratings/db"

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Not signed in" }, { status: 401 })

  const { env } = await getCloudflareContext({ async: true })
  const payload = await getRatingsPayload(env.DB, session.user.id)
  return NextResponse.json(payload)
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Not signed in" }, { status: 401 })

  const body = (await request.json()) as { movieId?: number; rating?: number }
  const movieId = Number(body.movieId)
  const rating = Number(body.rating)
  if (!Number.isFinite(movieId) || !Number.isFinite(rating)) {
    return NextResponse.json({ error: "Invalid movieId or rating" }, { status: 400 })
  }

  const { env } = await getCloudflareContext({ async: true })
  await setRating(env.DB, session.user.id, movieId, rating)
  return NextResponse.json({ ok: true })
}
