import { AREAS, type AreaDef } from '#/shared/areas'
import { getDatabase } from './db'

// Server-only queries behind the Openings areas. Kept out of src/server/api so no client bundle can reach the database.

/** FTS5 query matching any of an area's words, as prefixes. */
export const areaFts = (a: AreaDef) => a.words.map((w) => `"${w.replace(/"/g, '')}"*`).join(' OR ')

export type AreaMember = { id: string; name: string; sector: string | null; cohort: string | null; description: string | null }

export function areaMembers(a: AreaDef): AreaMember[] {
  return getDatabase()
    .query<AreaMember, [string]>(
      `SELECT s.id, s.name, s.sector, s.cohort, s.description FROM startups_fts f JOIN startups s ON s.id = f.startup_id
       WHERE startups_fts MATCH ? ORDER BY rank, s.id`,
    )
    .all(areaFts(a))
}

/** The area an idea's words fall in most, for the Ask page's "this idea sits in…" line. */
export function areaForWords(words: string[]) {
  let best: { id: string; name: string; count: number; score: number } | null = null
  for (const a of AREAS) {
    const score = words.filter((w) => a.words.some((x) => w.startsWith(x) || x.startsWith(w))).length
    if (score && (!best || score > best.score)) best = { id: a.id, name: a.name, count: areaMembers(a).length, score }
  }
  return best && { id: best.id, name: best.name, count: best.count }
}
