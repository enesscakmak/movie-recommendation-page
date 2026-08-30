// Offline checks on the recommender. Run with `pnpm eval`.
//
// Deliberately not a test framework: four checks against committed data don't
// justify pulling vitest into a static site. This exits non-zero on failure so
// it still works in CI.

import { readFileSync, existsSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"

import { decodeMatrix, expandCatalog } from "../lib/recommender/load"
import { buildUserVector, similarities, lookupRating } from "../lib/recommender/cosine"
import { recommend } from "../lib/recommender/recommend"
import { popularMovies } from "../lib/recommender/popular"
import type { CatalogMovie, DatasetMeta, RatingsMatrix, UserRating } from "../lib/recommender/types"

const HERE = dirname(fileURLToPath(import.meta.url))
const DATA = join(HERE, "..", "public", "data")

let failures = 0
function ok(label: string, passed: boolean, detail = "") {
  console.log(`  ${passed ? "PASS" : "FAIL"}  ${label}${detail ? ` - ${detail}` : ""}`)
  if (!passed) failures++
}

function load(): { catalog: CatalogMovie[]; m: RatingsMatrix; meta: DatasetMeta } {
  const metaPath = join(DATA, "dataset-meta.json")
  if (!existsSync(metaPath)) {
    console.error(`\nNo dataset at ${DATA}. Run \`pnpm build:dataset\` first.\n`)
    process.exit(1)
  }
  const meta = JSON.parse(readFileSync(metaPath, "utf8")) as DatasetMeta
  const catalog = expandCatalog(JSON.parse(readFileSync(join(DATA, "catalog.json"), "utf8")))
  const buf = readFileSync(join(DATA, meta.ratingsFile))
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
  return { catalog, m: decodeMatrix(ab as ArrayBuffer), meta }
}

/** All of a MovieLens user's catalogue ratings, as if they were the visitor. */
function ratingsOfUser(m: RatingsMatrix, catalog: CatalogMovie[], row: number): UserRating[] {
  const out: UserRating[] = []
  for (let i = m.rowPtr[row]; i < m.rowPtr[row + 1]; i++) {
    out.push({
      movieId: catalog[m.colIdx[i]].movieId,
      rating: m.values[i] / 2,
      ratedAt: new Date().toISOString(),
    })
  }
  return out
}

/** Deterministic PRNG, so a failing run reproduces. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ---------------------------------------------------------------------------
// 1. Golden test: the CSR similarity must match a naive dense implementation.
//    This is the check that catches offset and binary-search bugs, which are
//    otherwise completely invisible - wrong numbers still look like numbers.
// ---------------------------------------------------------------------------
function goldenTest(m: RatingsMatrix, catalog: CatalogMovie[]) {
  console.log("\n1. Golden test (CSR cosine vs naive dense)")

  const dense: Float64Array[] = []
  for (let u = 0; u < m.userCount; u++) {
    const row = new Float64Array(m.movieCount)
    for (let i = m.rowPtr[u]; i < m.rowPtr[u + 1]; i++) row[m.colIdx[i]] = m.values[i] / 2
    dense.push(row)
  }

  const rand = mulberry32(42)
  let maxDiff = 0

  for (let trial = 0; trial < 20; trial++) {
    const n = 3 + Math.floor(rand() * 20)
    const picked = new Set<number>()
    while (picked.size < n) picked.add(Math.floor(rand() * m.movieCount))

    const ratings: UserRating[] = [...picked].map((col) => ({
      movieId: catalog[col].movieId,
      rating: (1 + Math.floor(rand() * 10)) / 2,
      ratedAt: "",
    }))

    const vec = buildUserVector(ratings, m)
    const fast = similarities(vec, m, 0)

    for (let u = 0; u < m.userCount; u++) {
      let dot = 0
      for (let i = 0; i < vec.idx.length; i++) dot += vec.val[i] * dense[u][vec.idx[i]]
      const expected = vec.norm > 0 && m.fullNorm[u] > 0 ? dot / (vec.norm * m.fullNorm[u]) : 0
      maxDiff = Math.max(maxDiff, Math.abs(expected - fast[u]))
    }
  }

  ok("CSR matches dense within 1e-5", maxDiff < 1e-5, `max diff ${maxDiff.toExponential(2)}`)

  // lookupRating must agree with the dense matrix everywhere, not just on average.
  let lookupMismatch = 0
  for (let u = 0; u < Math.min(50, m.userCount); u++) {
    for (let col = 0; col < m.movieCount; col += 7) {
      if (lookupRating(m, u, col) !== dense[u][col]) lookupMismatch++
    }
  }
  ok("lookupRating matches dense", lookupMismatch === 0, `${lookupMismatch} mismatches`)
}

// ---------------------------------------------------------------------------
// 2. Hold-out: CF must beat popularity, not merely beat random. Beating random
//    is trivial and proves nothing about whether the algorithm works.
// ---------------------------------------------------------------------------
function holdOut(m: RatingsMatrix, catalog: CatalogMovie[], meta: DatasetMeta) {
  console.log("\n2. Hold-out recall@10 (CF vs popularity vs random)")

  const byCount = Array.from({ length: m.userCount }, (_, u) => u)
    .map((u) => ({ u, n: m.rowPtr[u + 1] - m.rowPtr[u] }))
    .sort((a, b) => b.n - a.n)
    .slice(0, 20)

  const ks = [10, 20, 30, 50, 100]
  const results = new Map<number, number>()
  let popRecall = 0
  let randRecall = 0

  for (const k of ks) {
    let total = 0
    for (const { u } of byCount) {
      const all = ratingsOfUser(m, catalog, u)
      const rand = mulberry32(u)
      const shuffled = [...all].sort(() => rand() - 0.5)
      const cut = Math.floor(shuffled.length * 0.8)
      const visible = shuffled.slice(0, cut)
      const hidden = new Set(shuffled.slice(cut).filter((r) => r.rating >= 4).map((r) => r.movieId))
      if (hidden.size === 0) continue

      // Exclude the user themselves from their own neighbourhood.
      const masked = maskUser(m, u)
      const recs = recommend(visible, [], masked, catalog, { k, count: 10, minRatingCount: meta.recommendableMinRatings })
      const hits = recs.filter((r) => hidden.has(r.movieId)).length
      total += hits / Math.min(10, hidden.size)
    }
    results.set(k, total / byCount.length)
  }

  // Baselines, measured on the same splits.
  for (const { u } of byCount) {
    const all = ratingsOfUser(m, catalog, u)
    const rand = mulberry32(u)
    const shuffled = [...all].sort(() => rand() - 0.5)
    const cut = Math.floor(shuffled.length * 0.8)
    const visible = shuffled.slice(0, cut)
    const hidden = new Set(shuffled.slice(cut).filter((r) => r.rating >= 4).map((r) => r.movieId))
    if (hidden.size === 0) continue

    const seen = new Set(visible.map((r) => r.movieId))
    const pop = popularMovies(catalog, { count: 10, minRatings: meta.recommendableMinRatings, excludeIds: seen })
    popRecall += pop.filter((mv) => hidden.has(mv.movieId)).length / Math.min(10, hidden.size)

    const pool = catalog.filter((mv) => !seen.has(mv.movieId))
    const r2 = mulberry32(u + 1000)
    const picks = new Set<number>()
    while (picks.size < 10 && picks.size < pool.length) picks.add(Math.floor(r2() * pool.length))
    randRecall += [...picks].filter((i) => hidden.has(pool[i].movieId)).length / Math.min(10, hidden.size)
  }
  popRecall /= byCount.length
  randRecall /= byCount.length

  for (const k of ks) console.log(`     k=${String(k).padStart(3)}  CF recall@10 = ${results.get(k)!.toFixed(4)}`)
  console.log(`     popularity  recall@10 = ${popRecall.toFixed(4)}`)
  console.log(`     random      recall@10 = ${randRecall.toFixed(4)}`)

  const bestK = [...results.entries()].sort((a, b) => b[1] - a[1])[0]
  console.log(`     best k = ${bestK[0]}`)
  ok("CF beats popularity", bestK[1] > popRecall, `${bestK[1].toFixed(4)} vs ${popRecall.toFixed(4)}`)
  ok("CF beats random", bestK[1] > randRecall, `${bestK[1].toFixed(4)} vs ${randRecall.toFixed(4)}`)
  if (bestK[0] !== 30) {
    console.log(`     NOTE best k is ${bestK[0]}, not the configured default of 30 - consider changing DEFAULT_OPTIONS.k`)
  }
}

/** A copy of the matrix with one user's row emptied, so they can't be their own neighbour. */
function maskUser(m: RatingsMatrix, row: number): RatingsMatrix {
  const fullNorm = Float32Array.from(m.fullNorm)
  fullNorm[row] = 0 // a zero norm forces similarity to 0 for this user
  return { ...m, fullNorm }
}

// ---------------------------------------------------------------------------
// 3. Genre coherence - the check you'd also run by hand in the UI.
// ---------------------------------------------------------------------------
function genreCoherence(m: RatingsMatrix, catalog: CatalogMovie[]) {
  console.log("\n3. Genre coherence")

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
    const recs = recommend(ratings, [], m, catalog, { count: 10 })
    const byId = new Map(catalog.map((c) => [c.movieId, c]))
    const matching = recs.filter((r) => byId.get(r.movieId)!.genres.some((g) => wanted.includes(g))).length
    console.log(`     ${label}: ${matching}/10 in {${wanted.join(", ")}}`)
    for (const r of recs.slice(0, 5)) {
      const mv = byId.get(r.movieId)!
      console.log(`        ${mv.title} (${mv.year}) [${mv.genres.join(", ")}] pred ${r.predicted.toFixed(2)}`)
    }
    ok(`${label} skews to ${wanted[0]}`, matching >= 6, `${matching}/10`)
  }

  run(["The Matrix", "Blade Runner", "Alien", "Terminator 2", "Interstellar"], ["Sci-Fi", "Action"], "sci-fi profile")
  run(["Sleepless in Seattle", "Notting Hill", "Pretty Woman", "Four Weddings", "You've Got Mail"], ["Romance", "Comedy"], "romcom profile")
}

// ---------------------------------------------------------------------------
// 4. Degenerate inputs must not crash or produce nonsense.
// ---------------------------------------------------------------------------
function degenerate(m: RatingsMatrix, catalog: CatalogMovie[]) {
  console.log("\n4. Degenerate cases")

  ok("no ratings returns nothing", recommend([], [], m, catalog).length === 0)

  const lowRated = catalog.slice(0, 5).map((mv) => ({ movieId: mv.movieId, rating: 0.5, ratedAt: "" }))
  const lowRecs = recommend(lowRated, [], m, catalog)
  const lowIds = new Set(lowRated.map((r) => r.movieId))
  ok("half-starred films are never recommended back", lowRecs.every((r) => !lowIds.has(r.movieId)))

  const everything = catalog.map((mv) => ({ movieId: mv.movieId, rating: 4, ratedAt: "" }))
  let threw = false
  let allRated: unknown[] = []
  try {
    allRated = recommend(everything, [], m, catalog)
  } catch {
    threw = true
  }
  ok("rating the entire catalogue returns empty, not a crash", !threw && allRated.length === 0)

  const obscure = [{ movieId: catalog[catalog.length - 1].movieId, rating: 5, ratedAt: "" }]
  let obscureThrew = false
  let obscureRecs: Array<{ score: number }> = []
  try {
    obscureRecs = recommend(obscure, [], m, catalog)
  } catch {
    obscureThrew = true
  }
  ok("a single obscure rating does not divide by zero", !obscureThrew && obscureRecs.every((r) => Number.isFinite(r.score)))

  const skipped = catalog.slice(0, 20).map((mv) => mv.movieId)
  const withSkips = recommend(
    catalog.slice(20, 26).map((mv) => ({ movieId: mv.movieId, rating: 5, ratedAt: "" })),
    skipped,
    m,
    catalog,
  )
  ok("skipped films stay out of the results", withSkips.every((r) => !skipped.includes(r.movieId)))

  const rated = catalog.slice(30, 40).map((mv) => ({ movieId: mv.movieId, rating: 4.5, ratedAt: "" }))
  const page1 = recommend(rated, [], m, catalog, { offset: 0 })
  const page2 = recommend(rated, [], m, catalog, { offset: 1 })
  ok(
    "Refresh returns a different page",
    page1.length > 0 && page2.length > 0 && page1[0].movieId !== page2[0].movieId,
  )
}

const { catalog, m, meta } = load()
console.log(`\nDataset: ${m.userCount} users x ${m.movieCount} movies, ${m.nnz} ratings`)
console.log(`Built ${meta.builtAt}`)

goldenTest(m, catalog)
holdOut(m, catalog, meta)
genreCoherence(m, catalog)
degenerate(m, catalog)

console.log(failures === 0 ? "\nAll checks passed.\n" : `\n${failures} check(s) failed.\n`)
process.exit(failures === 0 ? 0 : 1)
