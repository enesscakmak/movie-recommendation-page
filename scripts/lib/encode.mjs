// Encoder for ratings.bin - the MovieLens rating matrix in CSR (compressed
// sparse row) form, laid out so the browser can build typed-array views
// directly over the downloaded ArrayBuffer with zero copying and zero parsing.
//
// Layout (little-endian, every section 4-byte aligned):
//
//   magic    "MRC1"                            4 B
//   u32      userCount   U
//   u32      movieCount  M
//   u32      nnz
//   u32[M]   movieIds        catalogue index -> MovieLens movieId
//   i32[U]   userIds         row index -> MovieLens userId
//   f32[U]   fullNorm        L2 norm over the user's COMPLETE rating history
//   f32[U]   userMean        mean over the user's COMPLETE rating history
//   u32[U+1] rowPtr
//   u16[nnz] colIdx          catalogue index, strictly ascending within a row
//   u8 [nnz] values          rating * 2, so 0.5..5.0 maps to 1..10
//   (zero padding to a 4-byte boundary)
//
// colIdx being strictly ascending within each row is load-bearing: the
// similarity loop binary-searches these rows. decode() re-checks it.

export const MAGIC = "MRC1"

const align4 = (n) => (n + 3) & ~3

/**
 * @param {object} input
 * @param {number[]} input.movieIds     catalogue order; index i is catalogue index i
 * @param {number[]} input.userIds
 * @param {number[]} input.fullNorm     parallel to userIds
 * @param {number[]} input.userMean     parallel to userIds
 * @param {Array<Array<[number, number]>>} input.rows
 *        one entry per user, each a list of [catalogIndex, rating]
 * @returns {Buffer}
 */
export function encodeMatrix({ movieIds, userIds, fullNorm, userMean, rows }) {
  const U = userIds.length
  const M = movieIds.length
  if (M > 0xffff) throw new Error(`movieCount ${M} exceeds the u16 colIdx limit`)
  if (rows.length !== U) throw new Error(`rows (${rows.length}) does not match userIds (${U})`)

  const sorted = rows.map((row) => [...row].sort((a, b) => a[0] - b[0]))
  const nnz = sorted.reduce((acc, row) => acc + row.length, 0)

  const headerBytes = 4 + 3 * 4
  const size = align4(
    headerBytes + M * 4 + U * 4 + U * 4 + U * 4 + (U + 1) * 4 + nnz * 2 + nnz,
  )

  const buf = Buffer.alloc(size)
  let off = 0
  buf.write(MAGIC, off, "ascii"); off += 4
  buf.writeUInt32LE(U, off); off += 4
  buf.writeUInt32LE(M, off); off += 4
  buf.writeUInt32LE(nnz, off); off += 4

  for (const id of movieIds) { buf.writeUInt32LE(id, off); off += 4 }
  for (const id of userIds) { buf.writeInt32LE(id, off); off += 4 }
  for (const n of fullNorm) { buf.writeFloatLE(n, off); off += 4 }
  for (const m of userMean) { buf.writeFloatLE(m, off); off += 4 }

  // rowPtr
  let running = 0
  buf.writeUInt32LE(0, off); off += 4
  for (const row of sorted) {
    running += row.length
    buf.writeUInt32LE(running, off); off += 4
  }

  // colIdx
  for (const row of sorted) {
    let prev = -1
    for (const [col] of row) {
      if (col <= prev) throw new Error(`colIdx not strictly ascending (${prev} then ${col})`)
      if (col >= M) throw new Error(`colIdx ${col} out of range (movieCount ${M})`)
      prev = col
      buf.writeUInt16LE(col, off); off += 2
    }
  }

  // values, quantised to half-stars
  for (const row of sorted) {
    for (const [, rating] of row) {
      const q = Math.round(rating * 2)
      if (q < 1 || q > 10) throw new Error(`rating ${rating} out of range after quantising (${q})`)
      buf.writeUInt8(q, off); off += 1
    }
  }

  return buf
}

/**
 * Mirror of the browser-side reader, used by the build script to verify what
 * it just wrote. Kept here rather than imported from lib/ so the build stays
 * dependency-free on the app code.
 */
export function decodeMatrix(buffer) {
  const ab = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
  const dv = new DataView(ab)
  const magic = String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3))
  if (magic !== MAGIC) throw new Error(`bad magic ${JSON.stringify(magic)}`)

  const userCount = dv.getUint32(4, true)
  const movieCount = dv.getUint32(8, true)
  const nnz = dv.getUint32(12, true)

  let off = 16
  const movieIds = new Uint32Array(ab, off, movieCount); off += movieCount * 4
  const userIds = new Int32Array(ab, off, userCount); off += userCount * 4
  const fullNorm = new Float32Array(ab, off, userCount); off += userCount * 4
  const userMean = new Float32Array(ab, off, userCount); off += userCount * 4
  const rowPtr = new Uint32Array(ab, off, userCount + 1); off += (userCount + 1) * 4
  const colIdx = new Uint16Array(ab, off, nnz); off += nnz * 2
  const values = new Uint8Array(ab, off, nnz)

  return { userCount, movieCount, nnz, movieIds, userIds, fullNorm, userMean, rowPtr, colIdx, values }
}

/** Throws on any violated invariant. Called by the build script after writing. */
export function assertMatrixInvariants(m) {
  const fail = (msg) => { throw new Error(`ratings.bin invariant violated: ${msg}`) }

  if (m.rowPtr[0] !== 0) fail(`rowPtr[0] is ${m.rowPtr[0]}, expected 0`)
  if (m.rowPtr[m.userCount] !== m.nnz) fail(`rowPtr[U] is ${m.rowPtr[m.userCount]}, expected nnz ${m.nnz}`)
  for (let u = 0; u < m.userCount; u++) {
    if (m.rowPtr[u + 1] < m.rowPtr[u]) fail(`rowPtr decreases at user ${u}`)
    for (let i = m.rowPtr[u] + 1; i < m.rowPtr[u + 1]; i++) {
      if (m.colIdx[i] <= m.colIdx[i - 1]) fail(`colIdx not ascending in row ${u} at ${i}`)
    }
    if (!(m.fullNorm[u] > 0)) fail(`fullNorm[${u}] is ${m.fullNorm[u]}`)
    if (!(m.userMean[u] > 0)) fail(`userMean[${u}] is ${m.userMean[u]}`)
  }
  for (let i = 0; i < m.nnz; i++) {
    if (m.colIdx[i] >= m.movieCount) fail(`colIdx[${i}] = ${m.colIdx[i]} >= movieCount ${m.movieCount}`)
    if (m.values[i] < 1 || m.values[i] > 10) fail(`values[${i}] = ${m.values[i]} outside 1..10`)
  }
}
