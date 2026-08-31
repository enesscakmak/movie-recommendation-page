import type { D1Database } from "@cloudflare/workers-types"

export interface RatingsPayload {
  ratings: Record<string, number>
  ratedAt: Record<string, string>
  skipped: number[]
}

export async function getRatingsPayload(db: D1Database, userId: string): Promise<RatingsPayload> {
  const [ratingRows, skipRows] = await Promise.all([
    db.prepare("SELECT movie_id, rating, rated_at FROM ratings WHERE user_id = ?").bind(userId).all<{
      movie_id: number
      rating: number
      rated_at: string
    }>(),
    db.prepare("SELECT movie_id FROM skips WHERE user_id = ?").bind(userId).all<{ movie_id: number }>(),
  ])

  const ratings: Record<string, number> = {}
  const ratedAt: Record<string, string> = {}
  for (const row of ratingRows.results) {
    ratings[row.movie_id] = row.rating
    ratedAt[row.movie_id] = row.rated_at
  }

  return { ratings, ratedAt, skipped: skipRows.results.map((r) => r.movie_id) }
}

export async function setRating(db: D1Database, userId: string, movieId: number, rating: number): Promise<void> {
  if (rating > 0) {
    await db.batch([
      db
        .prepare(
          "INSERT INTO ratings (user_id, movie_id, rating, rated_at) VALUES (?, ?, ?, ?) " +
            "ON CONFLICT(user_id, movie_id) DO UPDATE SET rating = excluded.rating, rated_at = excluded.rated_at",
        )
        .bind(userId, movieId, rating, new Date().toISOString()),
      db.prepare("DELETE FROM skips WHERE user_id = ? AND movie_id = ?").bind(userId, movieId),
    ])
  } else {
    await db.prepare("DELETE FROM ratings WHERE user_id = ? AND movie_id = ?").bind(userId, movieId).run()
  }
}

export async function setSkip(db: D1Database, userId: string, movieId: number): Promise<void> {
  await db.batch([
    db
      .prepare(
        "INSERT INTO skips (user_id, movie_id, skipped_at) VALUES (?, ?, ?) " +
          "ON CONFLICT(user_id, movie_id) DO UPDATE SET skipped_at = excluded.skipped_at",
      )
      .bind(userId, movieId, new Date().toISOString()),
    db.prepare("DELETE FROM ratings WHERE user_id = ? AND movie_id = ?").bind(userId, movieId),
  ])
}
