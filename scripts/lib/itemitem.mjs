
import { streamRatings } from "./movielens.mjs"

export const LIKE_THRESHOLD = 4.0
const CAP_PER_USER = 300

export async function buildNeighborTable(dir, colOfMovieId, engineCount, opts = {}) {
  const { k = 20, alpha = 0.5, shrink = 20, onProgress } = opts
  const E = engineCount

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
