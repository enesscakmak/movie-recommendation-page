// Item-item similarity, trained offline on the FULL rating population (not
// just the shipped catalogue).
//
// Two movies are similar when the same people tend to rate both of them
// highly - not because a genre tag says so, but because real co-liking
// behaviour said so. That's what makes this "collaborative": no metadata
// about the films themselves ever enters the computation.
//
//   sim(i, j) = cooc(i, j) / (likeCount(i)^(1-a) * likeCount(j)^a + shrink)
//
// cooc(i, j) counts users who liked both. The denominator is a shrunk,
// asymmetric-cosine-style normaliser: without `shrink`, two obscure films
// that happen to share their only three likers would score a perfect 1.0,
// crowding out a pair backed by thousands of co-likers. Parameters
// (k=20, alpha=0.5, shrink=20, LIKE_THRESHOLD=4.0) were chosen by sweeping
// recall@10 on a held-out split - see HANDOFF/README for the numbers.
//
// The computation happens once, offline, over all ~33M ratings. Only the
// resulting top-K lists ship to the browser (see encode.mjs) - the training
// data itself never does.

import { streamRatings } from "./movielens.mjs"

export const LIKE_THRESHOLD = 4.0
// Caps a "rated everything" power user's cost at CAP^2 pairs instead of
// unboundedly quadratic; first-CAP-encountered is an acceptable sample since
// MovieLens exports are close to chronological per user.
const CAP_PER_USER = 300

/**
 * @param {string} dir - directory containing ratings.csv
 * @param {Map<number, number>} colOfMovieId - MovieLens movieId -> compact
 *   engine index (0..engineCount-1), containing ONLY engine-eligible movies
 * @param {number} engineCount
 * @param {{k?: number, alpha?: number, shrink?: number, onProgress?: (rows:number)=>void}} [opts]
 */
export async function buildNeighborTable(dir, colOfMovieId, engineCount, opts = {}) {
  const { k = 20, alpha = 0.5, shrink = 20, onProgress } = opts
  const E = engineCount

  // Per-user liked lists, engine-eligible movies only, capped. Plain arrays
  // in a Map: MovieLens ids are small but not dense, and this only needs to
  // survive one streaming pass, not be queried afterward.
  const likedByUser = new Map()
  let rows = 0
  for await (const { userId, movieId, rating } of streamRatings(dir)) {
    rows++
    if (onProgress && rows % 4_000_000 === 0) onProgress(rows)
    if (rating < LIKE_THRESHOLD) continue
    const col = colOfMovieId.get(movieId)
    if (col === undefined) continue
    let arr = likedByUser.get(userId)
    if (!arr) { arr = []; likedByUser.set(userId, arr) }
    if (arr.length < CAP_PER_USER) arr.push(col)
  }

  const likeCount = new Float64Array(E)
  const cooc = new Float32Array(E * E)
  for (const arr of likedByUser.values()) {
    for (let a = 0; a < arr.length; a++) likeCount[arr[a]]++
    for (let a = 0; a < arr.length; a++) {
      const base = arr[a] * E
      for (let b = 0; b < arr.length; b++) if (b !== a) cooc[base + arr[b]]++
    }
  }

  const nbrIdx = new Int32Array(E * k).fill(-1)
  const nbrSim = new Float32Array(E * k)
  const powLo = new Float64Array(E)
  const powHi = new Float64Array(E)
  for (let j = 0; j < E; j++) {
    powLo[j] = Math.pow(likeCount[j], 1 - alpha)
    powHi[j] = Math.pow(likeCount[j], alpha)
  }

  const cand = []
  for (let i = 0; i < E; i++) {
    cand.length = 0
    const base = i * E
    for (let j = 0; j < E; j++) {
      const c = cooc[base + j]
      if (c === 0 || j === i) continue
      cand.push([j, c / (powLo[i] * powHi[j] + shrink)])
    }
    cand.sort((a, b) => b[1] - a[1])
    for (let t = 0; t < k && t < cand.length; t++) {
      nbrIdx[i * k + t] = cand[t][0]
      nbrSim[i * k + t] = cand[t][1]
    }
  }

  return { k, nbrIdx, nbrSim, ratingRowsScanned: rows, likedUserCount: likedByUser.size }
}
