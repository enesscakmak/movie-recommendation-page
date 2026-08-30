// The similarity core, ported from MovieRecommender.java.
//
// This module imports nothing - no next/*, no DOM, no app code - so
// scripts/eval-recommender.mjs can exercise it under plain node.

import type { RatingsMatrix, UserRating, UserVector } from "./types"

/**
 * Find a user's rating for one catalogue column, or 0 if they never rated it.
 *
 * colIdx is strictly ascending within a row (the encoder enforces it), so this
 * is a binary search over ~115 entries: about seven steps.
 */
export function lookupRating(m: RatingsMatrix, user: number, col: number): number {
  let lo = m.rowPtr[user]
  let hi = m.rowPtr[user + 1] - 1
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1
    const c = m.colIdx[mid]
    if (c === col) return m.values[mid] / 2
    if (c < col) lo = mid + 1
    else hi = mid - 1
  }
  return 0
}

/**
 * Turn the visitor's ratings into a sparse vector over catalogue indices.
 * Ratings for films outside the catalogue are dropped; ratings of 0 mean
 * "unrated" and are dropped too.
 */
export function buildUserVector(ratings: UserRating[], m: RatingsMatrix): UserVector {
  const pairs: Array<[number, number]> = []
  for (const r of ratings) {
    if (!(r.rating > 0)) continue
    const col = m.indexOfMovieId.get(r.movieId)
    if (col === undefined) continue
    pairs.push([col, r.rating])
  }
  pairs.sort((a, b) => a[0] - b[0])

  const idx = new Uint16Array(pairs.length)
  const val = new Float32Array(pairs.length)
  let sumSq = 0
  let sum = 0
  for (let i = 0; i < pairs.length; i++) {
    idx[i] = pairs[i][0]
    val[i] = pairs[i][1]
    sumSq += pairs[i][1] * pairs[i][1]
    sum += pairs[i][1]
  }

  return {
    idx,
    val,
    norm: Math.sqrt(sumSq),
    mean: pairs.length > 0 ? sum / pairs.length : 0,
  }
}

/**
 * Cosine similarity between the visitor and every MovieLens user.
 *
 * Raw cosine with unmatched entries treated as zero - exactly what the Java
 * original computed. It is also the right call here: a visitor with five to
 * fifteen ratings gives Pearson almost nothing to work with, whereas raw
 * cosine's implicit zero acts as a co-occurrence prior that keeps small-sample
 * similarity stable.
 *
 * The denominator uses each user's norm over their COMPLETE history, so this
 * reproduces full-matrix cosine even though only catalogue columns are shipped.
 *
 * Cost: iterate the visitor's handful of entries and binary-search each user's
 * row. Around 610 x 15 x 7 operations - well under a millisecond. Do not
 * invert this loop to walk the matrix.
 */
export function similarities(vec: UserVector, m: RatingsMatrix, minOverlap = 2): Float32Array {
  const sims = new Float32Array(m.userCount)
  if (vec.idx.length === 0 || vec.norm === 0) return sims

  for (let u = 0; u < m.userCount; u++) {
    let dot = 0
    let overlap = 0
    for (let i = 0; i < vec.idx.length; i++) {
      const r = lookupRating(m, u, vec.idx[i])
      if (r > 0) {
        dot += vec.val[i] * r
        overlap++
      }
    }
    const denom = vec.norm * m.fullNorm[u]
    sims[u] = overlap >= minOverlap && denom > 0 ? dot / denom : 0
  }
  return sims
}

/** Row indices of the k most similar users with a non-zero similarity. */
export function topNeighbors(sims: Float32Array, k: number): number[] {
  const idx: number[] = []
  for (let u = 0; u < sims.length; u++) if (sims[u] > 0) idx.push(u)
  idx.sort((a, b) => sims[b] - sims[a])
  return idx.slice(0, k)
}
