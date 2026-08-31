
export const MAGIC = "MIN1"
const EMPTY = 0xffff

export function encodeNeighborTable({ movieCount, k, neighborIdx, neighborSim }) {
  if (movieCount > 0xffff) throw new Error(`movieCount ${movieCount} exceeds the u16 index limit`)
  const n = movieCount * k
  if (neighborIdx.length !== n) throw new Error(`neighborIdx length ${neighborIdx.length} !== movieCount*k ${n}`)

  const buf = Buffer.alloc(4 + 4 + 4 + n * 2 + n * 2)
  let off = 0
  buf.write(MAGIC, off, "ascii"); off += 4
  buf.writeUInt32LE(movieCount, off); off += 4
  buf.writeUInt32LE(k, off); off += 4
  for (let i = 0; i < n; i++) {
    const idx = neighborIdx[i]
    buf.writeUInt16LE(idx < 0 ? EMPTY : idx, off); off += 2
  }
  for (let i = 0; i < n; i++) {
    const sim = neighborIdx[i] < 0 ? 0 : Math.max(0, Math.min(1, neighborSim[i]))
    buf.writeUInt16LE(Math.round(sim * 65535), off); off += 2
  }
  return buf
}

export function decodeNeighborTable(buffer) {
  const ab = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
  const dv = new DataView(ab)
  const magic = String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3))
  if (magic !== MAGIC) throw new Error(`bad magic ${JSON.stringify(magic)}`)

  const movieCount = dv.getUint32(4, true)
  const k = dv.getUint32(8, true)
  let off = 12
  const n = movieCount * k
  const neighborIdx = new Uint16Array(ab, off, n); off += n * 2
  const neighborSim = new Uint16Array(ab, off, n)
  return { movieCount, k, neighborIdx, neighborSim }
}

export function assertNeighborTableInvariants({ movieCount, k, neighborIdx, neighborSim }) {
  const fail = (msg) => { throw new Error(`itemnb.bin invariant violated: ${msg}`) }
  const n = movieCount * k
  for (let i = 0; i < n; i++) {
    const movie = Math.floor(i / k)
    const idx = neighborIdx[i]
    if (idx === EMPTY) {
      if (neighborSim[i] !== 0) fail(`empty slot ${i} has nonzero similarity ${neighborSim[i]}`)
      continue
    }
    if (idx >= movieCount) fail(`neighborIdx[${i}] = ${idx} >= movieCount ${movieCount}`)
    if (idx === movie) fail(`movie ${movie} lists itself as a neighbour`)
  }
}
