CREATE TABLE IF NOT EXISTS ratings (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  movie_id INTEGER NOT NULL,
  rating REAL NOT NULL,
  rated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, movie_id)
);

CREATE TABLE IF NOT EXISTS skips (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  movie_id INTEGER NOT NULL,
  skipped_at TEXT NOT NULL,
  PRIMARY KEY (user_id, movie_id)
);

CREATE INDEX IF NOT EXISTS idx_ratings_user ON ratings(user_id);
CREATE INDEX IF NOT EXISTS idx_skips_user ON skips(user_id);
