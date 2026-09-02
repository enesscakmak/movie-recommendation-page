import { readFileSync, writeFileSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT_DIR = join(HERE, "..", "public", "data")

function decadeOf(year) {
  return Math.floor(year / 10) * 10
}

function main() {
  const catalog = JSON.parse(readFileSync(join(OUT_DIR, "catalog.json"), "utf8"))

  const genres = {}
  const decades = {}
  let totalGenreWeight = 0
  let totalDecadeWeight = 0

  for (const m of catalog.movies) {
    const weight = m.n
    for (const g of m.g) {
      genres[g] = (genres[g] ?? 0) + weight
      totalGenreWeight += weight
    }
    const decade = decadeOf(m.y)
    decades[decade] = (decades[decade] ?? 0) + weight
    totalDecadeWeight += weight
  }

  const population = {
    schemaVersion: 1,
    builtAt: new Date().toISOString(),
    totalGenreWeight,
    totalDecadeWeight,
    genres,
    decades,
  }

  const buf = Buffer.from(JSON.stringify(population))
  writeFileSync(join(OUT_DIR, "population.json"), buf)

  console.log(`Wrote public/data/population.json (${buf.length} bytes)`)
  console.log(`  ${Object.keys(genres).length} genres, ${Object.keys(decades).length} decades`)
}

main()
