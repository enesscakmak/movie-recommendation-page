import { NextResponse } from "next/server"
import { getCloudflareContext } from "@opennextjs/cloudflare"

import { auth } from "@/auth"
import { addToWatchlist, removeFromWatchlist } from "@/lib/ratings/db"

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Not signed in" }, { status: 401 })

  const body = (await request.json()) as { movieId?: number }
  const movieId = Number(body.movieId)
  if (!Number.isFinite(movieId)) {
    return NextResponse.json({ error: "Invalid movieId" }, { status: 400 })
  }

  const { env } = await getCloudflareContext({ async: true })
  await addToWatchlist(env.DB, session.user.id, movieId)
  return NextResponse.json({ ok: true })
}

export async function DELETE(request: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Not signed in" }, { status: 401 })

  const body = (await request.json()) as { movieId?: number }
  const movieId = Number(body.movieId)
  if (!Number.isFinite(movieId)) {
    return NextResponse.json({ error: "Invalid movieId" }, { status: 400 })
  }

  const { env } = await getCloudflareContext({ async: true })
  await removeFromWatchlist(env.DB, session.user.id, movieId)
  return NextResponse.json({ ok: true })
}
