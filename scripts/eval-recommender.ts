
import { readFileSync, existsSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"

import { decodeNeighborTable, expandCatalog } from "../lib/recommender/load"
import { itemSimilarity, recommend, hasUsableNeighbors } from "../lib/recommender/itemitem"
import { popularMovies } from "../lib/recommender/popular"
import type { CatalogMovie, DatasetMeta, ItemNeighbors, UserRating } from "../lib/recommender/types"
import { streamRatings, EXPECTED } from "./lib/movielens.mjs"
import { LIKE_THRESHOLD } from "./lib/itemitem.mjs"

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, "..")
const DATA = join(ROOT, "public", "data")
const RAW_DIR = join(HERE, "data", "ml-latest-small")
const EXPECTED_RATINGS = EXPECTED.ratings

let failures = 0
function ok(label: string, passed: boolean, detail = "") {
  console.log(`  ${passed ? "PASS" : "FAIL"}  ${label}${detail ? ` - ${detail}` : ""}`)
  if (!passed) failures++
}

function load(): { catalog: CatalogMovie[]; nb: ItemNeighbors; meta: DatasetMeta } {
  const metaPath = join(DATA, "dataset-meta.json")
  if (!existsSync(metaPath)) {
    console.error(`\nNo dataset at ${DATA}. Run \`pnpm build:dataset\` first.\n`)
    process.exit(1)
  }
  const meta = JSON.parse(readFileSync(metaPath, "utf8")) as DatasetMeta
  const catalog = expandCatalog(JSON.parse(readFileSync(join(DATA, "catalog.json"), "utf8")))
  const buf = readFileSync(join(DATA, meta.neighborsFile))
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
  return { catalog, nb: decodeNeighborTable(ab as ArrayBuffer), meta }
}

function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

async function goldenTest(catalog: CatalogMovie[], nb: ItemNeighbors, meta: DatasetMeta) {
  console.log("\n1. Golden test (shipped neighbours vs from-scratch recomputation)")

  const byRatingCount = [...catalog].sort((a, b) => b.ratingCount - a.ratingCount)
  const engineOnly = byRatingCount.filter((m) => m.ratingCount >= meta.recommendableMinRatings)
  const sample = [engineOnly[0], engineOnly[Math.floor(engineOnly.length / 2)], engineOnly[engineOnly.length - 1]]
  const targetCols = new Set(sample.map((m) => m.index))
  const colOfMovieId = new Map(catalog.map((m) => [m.movieId, m.index]))
  const engineIds = new Set(engineOnly.map((m) => m.movieId))

  console.log(`     recomputing co-occurrence for: ${sample.map((m) => m.title).join(", ")}`)

  const likeCount = new Map<number, number>()
  const cooc = new Map<number, Map<number, number>>() // target col -> (other col -> count)
  for (const c of targetCols) cooc.set(c, new Map())

  let rows = 0
  for await (const { movieId, rating } of streamRatings(RAW_DIR)) {
    rows++
    if (rating < LIKE_THRESHOLD || !engineIds.has(movieId)) continue
    likeCount.set(movieId, (likeCount.get(movieId) ?? 0) + 1)
  }

  const likedByUser = new Map<number, number[]>()
  for await (const { userId, movieId, rating } of streamRatings(RAW_DIR)) {
    if (rating < LIKE_THRESHOLD || !engineIds.has(movieId)) continue
    let arr = likedByUser.get(userId)
    if (!arr) { arr = []; likedByUser.set(userId, arr) }
    if (arr.length < 300) arr.push(movieId)
  }
  for (const liked of likedByUser.values()) {
    for (const mid of liked) {
      const col = colOfMovieId.get(mid)
      if (col === undefined || !targetCols.has(col)) continue
      const m = cooc.get(col)!
      for (const other of liked) {
        if (other === mid) continue
        const oc = colOfMovieId.get(other)
        if (oc === undefined) continue
        m.set(oc, (m.get(oc) ?? 0) + 1)
      }
    }
  }

  const ALPHA = 0.5, SHRINK = 20
  let worstOverlap = 1
  for (const m of sample) {
    const counts = cooc.get(m.index)!
    const ranked = [...counts.entries()]
      .map(([col, c]) => {
        const other = catalog[col]
        const sim = c / (Math.pow(likeCount.get(m.movieId) ?? 1, 1 - ALPHA) * Math.pow(likeCount.get(other.movieId) ?? 1, ALPHA) + SHRINK)
        return [col, sim] as const
      })
      .sort((a, b) => b[1] - a[1])
      .slice(0, nb.k)
      .map(([col]) => col)

    const shippedSet = new Set<number>()
    for (let t = 0; t < nb.k; t++) {
      const idx = nb.neighborIdx[m.index * nb.k + t]
      if (idx !== 0xffff) shippedSet.add(idx)
    }
    const recomputedSet = new Set(ranked)
    const overlap = [...shippedSet].filter((c) => recomputedSet.has(c)).length / Math.max(1, shippedSet.size)
    worstOverlap = Math.min(worstOverlap, overlap)
    console.log(`     ${m.title}: ${(overlap * 100).toFixed(0)}% of shipped top-${nb.k} confirmed by independent recomputation`)
  }
  ok("independent recomputation agrees with the shipped table", worstOverlap >= 0.8, `worst overlap ${(worstOverlap * 100).toFixed(0)}%`)
  ok("ratings.csv still has the expected row count", rows === EXPECTED_RATINGS, `${fmtN(rows)} rows`)
}

async function sampleTestUsers(catalog: CatalogMovie[], count: number) {
  const colOfMovieId = new Map(catalog.map((m) => [m.movieId, m.index]))
  const byUser = new Map<number, Array<[number, number]>>() // userId -> [movieId, rating][]
  for await (const { userId, movieId, rating } of streamRatings(RAW_DIR)) {
    if (userId % 40 !== 0) continue // subsample the population, not the per-user history
    if (!colOfMovieId.has(movieId)) continue
    let arr = byUser.get(userId)
    if (!arr) { arr = []; byUser.set(userId, arr) }
    arr.push([movieId, rating])
  }
  const eligible = [...byUser.entries()].filter(([, r]) => r.length >= 40 && r.length <= 600)
  const rnd = mulberry32(7)
  const picked: Array<{ userId: number; visible: UserRating[]; hidden: Set<number> }> = []
  const seen = new Set<number>()
  const maxAttempts = eligible.length * 5
  for (let attempt = 0; picked.length < count && attempt < maxAttempts; attempt++) {
    const [userId, items] = eligible[Math.floor(rnd() * eligible.length)]
    if (seen.has(userId)) continue
    seen.add(userId)
    const r = mulberry32(userId)
    const shuffled = [...items].sort(() => r() - 0.5)
    const cut = Math.floor(shuffled.length * 0.8)
    const visible: UserRating[] = shuffled.slice(0, cut).map(([movieId, rating]) => ({ movieId, rating, ratedAt: "" }))
    const hidden = new Set(shuffled.slice(cut).filter(([, rating]) => rating >= 4).map(([movieId]) => movieId))
    if (hidden.size > 0) picked.push({ userId, visible, hidden })
  }
  return picked
}

async function holdOut(catalog: CatalogMovie[], nb: ItemNeighbors, meta: DatasetMeta) {
  console.log("\n2. Hold-out recall@10 (item-item vs popularity vs random)")
  const users = await sampleTestUsers(catalog, 300)
  console.log(`     ${users.length} test users, 80/20 split, hits among ratings hidden at >= 4 stars`)

  const recallOf = (fn: (visible: UserRating[]) => number[]) =>
    users.reduce((t, u) => t + fn(u.visible).filter((id) => u.hidden.has(id)).length / Math.min(10, u.hidden.size), 0) / users.length

  const itemItemRecall = recallOf((visible) => recommend(visible, [], nb, catalog, { minRatingCount: meta.recommendableMinRatings }).map((r) => r.movieId))
  const popRecall = recallOf((visible) => {
    const seen = new Set(visible.map((r) => r.movieId))
    return popularMovies(catalog, { count: 10, minRatings: meta.recommendableMinRatings, excludeIds: seen }).map((m) => m.movieId)
  })
  const randRecall = recallOf((visible) => {
    const seen = new Set(visible.map((r) => r.movieId))
    const pool = catalog.filter((m) => m.ratingCount >= meta.recommendableMinRatings && !seen.has(m.movieId))
    const r2 = mulberry32(visible.length + 1000)
    const picks = new Set<number>()
    while (picks.size < 10 && picks.size < pool.length) picks.add(Math.floor(r2() * pool.length))
    return [...picks].map((i) => pool[i].movieId)
  })

  console.log(`     item-item  recall@10 = ${itemItemRecall.toFixed(4)}`)
  console.log(`     popularity recall@10 = ${popRecall.toFixed(4)}`)
  console.log(`     random     recall@10 = ${randRecall.toFixed(4)}`)
  ok("item-item beats popularity", itemItemRecall > popRecall, `${itemItemRecall.toFixed(4)} vs ${popRecall.toFixed(4)}`)
  ok("item-item beats random", itemItemRecall > randRecall, `${itemItemRecall.toFixed(4)} vs ${randRecall.toFixed(4)}`)

  return users
}

function diversityCheck(catalog: CatalogMovie[], nb: ItemNeighbors, meta: DatasetMeta, users: Array<{ visible: UserRating[]; hidden: Set<number> }>) {
  console.log("\n3. Diversity re-rank (MMR vs plain relevance ranking)")

  const avgPairwiseSim = (picks: number[][]) => {
    let sum = 0, pairs = 0
    for (const ids of picks) {
      const cols = ids.map((id) => catalog.find((m) => m.movieId === id)?.index).filter((c): c is number => c !== undefined)
      for (let a = 0; a < cols.length; a++) for (let b = a + 1; b < cols.length; b++) { sum += itemSimilarity(nb, cols[a], cols[b]); pairs++ }
    }
    return pairs > 0 ? sum / pairs : 0
  }
  const recallOf = (picks: number[][]) =>
    users.reduce((t, u, i) => t + picks[i].filter((id) => u.hidden.has(id)).length / Math.min(10, u.hidden.size), 0) / users.length

  const plain = users.map((u) => recommend(u.visible, [], nb, catalog, { minRatingCount: meta.recommendableMinRatings, diversity: 0 }).map((r) => r.movieId))
  const diverse = users.map((u) => recommend(u.visible, [], nb, catalog, { minRatingCount: meta.recommendableMinRatings }).map((r) => r.movieId))

  const simPlain = avgPairwiseSim(plain)
  const simDiverse = avgPairwiseSim(diverse)
  const recallPlain = recallOf(plain)
  const recallDiverse = recallOf(diverse)

  console.log(`     diversity=0    avg pairwise item-sim = ${simPlain.toFixed(4)}   recall@10 = ${recallPlain.toFixed(4)}`)
  console.log(`     diversity=0.5  avg pairwise item-sim = ${simDiverse.toFixed(4)}   recall@10 = ${recallDiverse.toFixed(4)}`)
  ok("MMR reduces redundancy among the top 10", simDiverse < simPlain, `${simDiverse.toFixed(4)} vs ${simPlain.toFixed(4)}`)
  ok("MMR does not meaningfully hurt recall", recallDiverse > recallPlain * 0.9, `${recallDiverse.toFixed(4)} vs ${recallPlain.toFixed(4)}`)
}

function negativeSignalRecall(catalog: CatalogMovie[], nb: ItemNeighbors, meta: DatasetMeta, users: Array<{ visible: UserRating[]; hidden: Set<number> }>) {
  console.log("\n3b. Negative ratings vs recall (dislike signal on vs off, same hold-out users)")

  const recallOf = (fn: (visible: UserRating[]) => number[]) =>
    users.reduce((t, u) => t + fn(u.visible).filter((id) => u.hidden.has(id)).length / Math.min(10, u.hidden.size), 0) / users.length

  const withDislikes = recallOf((visible) => recommend(visible, [], nb, catalog, { minRatingCount: meta.recommendableMinRatings }).map((r) => r.movieId))
  const withoutDislikes = recallOf((visible) => recommend(visible, [], nb, catalog, { minRatingCount: meta.recommendableMinRatings, dislikeThreshold: 0 }).map((r) => r.movieId))

  console.log(`     recall@10 with dislike signal     = ${withDislikes.toFixed(4)}`)
  console.log(`     recall@10 ignoring dislikes (old)  = ${withoutDislikes.toFixed(4)}`)
  ok("modelling dislikes as negative signal does not hurt recall", withDislikes >= withoutDislikes * 0.97, `${withDislikes.toFixed(4)} vs ${withoutDislikes.toFixed(4)}`)
}

function dislikeDemotion(catalog: CatalogMovie[], nb: ItemNeighbors, meta: DatasetMeta) {
  console.log("\n3c. Disliking a film demotes its close neighbours")

  const find = (title: string) =>
    catalog.find((c) => c.title.toLowerCase() === title.toLowerCase()) ??
    catalog.find((c) => c.title.toLowerCase().includes(title.toLowerCase()))

  const liked = ["The Matrix", "Blade Runner", "Alien", "Terminator 2", "Interstellar"].map(find).filter(Boolean) as CatalogMovie[]
  if (liked.length < 3) { console.log("     SKIP - seed titles not found in catalogue"); return }

  const likedRatings: UserRating[] = liked.map((m) => ({ movieId: m.movieId, rating: 5, ratedAt: "" }))
  const baseline = recommend(likedRatings, [], nb, catalog, { count: 10, minRatingCount: meta.recommendableMinRatings, diversity: 0 })
  if (baseline.length === 0) { console.log("     SKIP - no baseline recommendations"); return }

  const target = catalog.find((c) => c.movieId === baseline[0].movieId)!
  const avgSimToTarget = (ids: number[]) => {
    const cols = ids.filter((id) => id !== target.movieId).map((id) => catalog.find((m) => m.movieId === id)?.index).filter((c): c is number => c !== undefined)
    if (cols.length === 0) return 0
    return cols.reduce((s, c) => s + itemSimilarity(nb, c, target.index), 0) / cols.length
  }
  const baselineSim = avgSimToTarget(baseline.map((r) => r.movieId))

  const withDislike: UserRating[] = [...likedRatings, { movieId: target.movieId, rating: 1, ratedAt: "" }]
  const after = recommend(withDislike, [], nb, catalog, { count: 10, minRatingCount: meta.recommendableMinRatings, diversity: 0 })
  const afterSim = avgSimToTarget(after.map((r) => r.movieId))

  console.log(`     disliking "${target.title}": avg similarity of top-10 to it ${baselineSim.toFixed(4)} -> ${afterSim.toFixed(4)}`)
  ok("disliking a film demotes its close neighbours", afterSim < baselineSim, `${afterSim.toFixed(4)} vs ${baselineSim.toFixed(4)}`)
  ok("the disliked film itself never reappears", !after.some((r) => r.movieId === target.movieId))
}

function genreCoherence(catalog: CatalogMovie[], nb: ItemNeighbors, meta: DatasetMeta) {
  console.log("\n4. Genre coherence")

  const find = (title: string) =>
    catalog.find((c) => c.title.toLowerCase() === title.toLowerCase()) ??
    catalog.find((c) => c.title.toLowerCase().includes(title.toLowerCase()))

  const run = (titles: string[], wanted: string[], label: string) => {
    const found = titles.map(find).filter(Boolean) as CatalogMovie[]
    if (found.length < 3) {
      console.log(`     SKIP ${label} - only matched ${found.length}/${titles.length} titles in the catalogue`)
      return
    }
    const ratings: UserRating[] = found.map((mv) => ({ movieId: mv.movieId, rating: 5, ratedAt: "" }))
    const recs = recommend(ratings, [], nb, catalog, { count: 10, minRatingCount: meta.recommendableMinRatings })
    const byId = new Map(catalog.map((c) => [c.movieId, c]))
    const matching = recs.filter((r) => byId.get(r.movieId)!.genres.some((g) => wanted.includes(g))).length
    console.log(`     ${label}: ${matching}/10 in {${wanted.join(", ")}}`)
    for (const r of recs.slice(0, 5)) {
      const mv = byId.get(r.movieId)!
      const because = r.because.map((id) => byId.get(id)?.title).filter(Boolean).join(", ")
      console.log(`        ${mv.title} (${mv.year}) [${mv.genres.join(", ")}] because: ${because}`)
    }
    ok(`${label} skews to ${wanted[0]}`, matching >= 5, `${matching}/10`)
  }

  run(["The Matrix", "Blade Runner", "Alien", "Terminator 2", "Interstellar"], ["Sci-Fi", "Action"], "sci-fi profile")
  run(["Sleepless in Seattle", "Notting Hill", "Pretty Woman", "Four Weddings", "You've Got Mail"], ["Romance", "Comedy"], "romcom profile")
}

function degenerate(catalog: CatalogMovie[], nb: ItemNeighbors, meta: DatasetMeta) {
  console.log("\n5. Degenerate cases")

  ok("no ratings returns nothing", recommend([], [], nb, catalog).length === 0)

  const neutralRated = catalog.slice(0, 5).map((mv) => ({ movieId: mv.movieId, rating: 3, ratedAt: "" }))
  ok("neutral-zone ratings contribute no signal", !hasUsableNeighbors(neutralRated, nb, catalog))
  ok("neutral-zone ratings recommend nothing", recommend(neutralRated, [], nb, catalog).length === 0)

  const allDisliked = catalog.slice(0, 5).map((mv) => ({ movieId: mv.movieId, rating: 1, ratedAt: "" }))
  ok("all-dislike ratings recommend nothing (no positive evidence)", recommend(allDisliked, [], nb, catalog).length === 0)

  const engineMovies = catalog.filter((m) => m.ratingCount >= meta.recommendableMinRatings)
  const everything = catalog.map((mv) => ({ movieId: mv.movieId, rating: 4.5, ratedAt: "" }))
  let threw = false
  let allRated: unknown[] = []
  try {
    allRated = recommend(everything, [], nb, catalog, { minRatingCount: meta.recommendableMinRatings })
  } catch {
    threw = true
  }
  ok("rating the entire catalogue returns empty, not a crash", !threw && allRated.length === 0)

  const obscure = [{ movieId: catalog[catalog.length - 1].movieId, rating: 5, ratedAt: "" }]
  let obscureThrew = false
  let obscureRecs: unknown[] = []
  try {
    obscureRecs = recommend(obscure, [], nb, catalog)
  } catch {
    obscureThrew = true
  }
  ok("a single obscure (non-engine) rating does not crash", !obscureThrew)

  const skipped = engineMovies.slice(0, 20).map((mv) => mv.movieId)
  const withSkips = recommend(
    engineMovies.slice(20, 26).map((mv) => ({ movieId: mv.movieId, rating: 5, ratedAt: "" })),
    skipped,
    nb,
    catalog,
    { minRatingCount: meta.recommendableMinRatings },
  )
  ok("skipped films stay out of the results", withSkips.every((r) => !skipped.includes(r.movieId)))

  const rated = engineMovies.slice(30, 40).map((mv) => ({ movieId: mv.movieId, rating: 4.5, ratedAt: "" }))
  const page1 = recommend(rated, [], nb, catalog, { offset: 0, minRatingCount: meta.recommendableMinRatings })
  const page2 = recommend(rated, [], nb, catalog, { offset: 1, minRatingCount: meta.recommendableMinRatings })
  ok(
    "Refresh returns a different page",
    page1.length > 0 && page2.length > 0 && page1[0].movieId !== page2[0].movieId,
  )
}

async function main() {
  const { catalog, nb, meta } = load()
  console.log(`\nDataset: ${fmtN(catalog.length)} catalogue movies, ${fmtN(meta.engineItemCount)} engine items, k=${nb.k}`)
  console.log(`Built ${meta.builtAt}`)

  await goldenTest(catalog, nb, meta)
  const users = await holdOut(catalog, nb, meta)
  negativeSignalRecall(catalog, nb, meta, users)
  dislikeDemotion(catalog, nb, meta)
  diversityCheck(catalog, nb, meta, users)
  genreCoherence(catalog, nb, meta)
  degenerate(catalog, nb, meta)

  console.log(failures === 0 ? "\nAll checks passed.\n" : `\n${failures} check(s) failed.\n`)
  process.exit(failures === 0 ? 0 : 1)
}

function fmtN(n: number) {
  return n.toLocaleString("en-US")
}

main()
