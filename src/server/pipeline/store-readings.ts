import type { Database } from 'bun:sqlite'
import type { Lane } from './lanes'
import { derive, type DeriveFounder, type DeriveStartup } from './derive'
import type { StoredReading } from './readings'
import type { RunNote } from './types'

// Build's last step for lanes: derives the readings from the stored startups and founders, replaces the `readings`
// table, and writes the standard display names onto startups and founders. Decisions are never touched here.

export type StoreResult = { total: number; rule: number; inferred: number; review: number; displayNames: number; founderNames: number }

type StartupRow = {
  id: string
  name: string
  description: string | null
  sector: string | null
  creationYear: number | null
  domain: string | null
  email: string | null
}

type FounderRow = { startupId: string; position: number; name: string; personKey: string }
type VectorRow = { startup_id: string; embedding: Uint8Array }

/** A published email, or null when the registry left the field empty or as "n.a.". */
export function cleanEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (trimmed === '' || /^n\.a\.?$/i.test(trimmed)) return null
  return trimmed
}

/** Little-endian float32 bytes as a Float32Array; copies first when the bytes are not 4-byte aligned. */
function toFloat32(bytes: Uint8Array): Float32Array {
  const aligned = bytes.byteOffset % 4 === 0 ? bytes : bytes.slice()
  return new Float32Array(aligned.buffer, aligned.byteOffset, aligned.byteLength / 4)
}

/** Cosine of two vectors, or null when either is missing or empty. */
function cosine(a: Float32Array, b: Float32Array): number | null {
  if (a.length === 0 || a.length !== b.length) return null
  let dot = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  if (normA === 0 || normB === 0) return null
  return dot / Math.sqrt(normA * normB)
}

/** Description vectors by startup id. Any failure (for example Build ran before Embed) means no vectors. */
function loadVectors(db: Database): Map<string, Float32Array> {
  const vectors = new Map<string, Float32Array>()
  try {
    for (const row of db.query<VectorRow, []>('SELECT startup_id, embedding FROM startup_vectors').all())
      vectors.set(row.startup_id, toFloat32(row.embedding))
  } catch {
    return new Map()
  }
  return vectors
}

export function storeReadings(db: Database): StoreResult {
  let result: StoreResult = { total: 0, rule: 0, inferred: 0, review: 0, displayNames: 0, founderNames: 0 }

  db.transaction(() => {
    const startups: DeriveStartup[] = db
      .query<StartupRow, []>(
        `SELECT s.id, s.name, s.description, s.sector, s.creation_year AS creationYear, s.domain,
                json_extract(e.raw_json, '$.email') AS email
         FROM startups s LEFT JOIN entries e ON e.id = s.entry_id
         ORDER BY s.id`,
      )
      .all()
      .map((s) => ({ ...s, email: cleanEmail(s.email) }))

    const founders = db
      .query<FounderRow, []>('SELECT startup_id AS startupId, position, name, person_key AS personKey FROM founders ORDER BY startup_id, position')
      .all() as DeriveFounder[]

    const vectors = loadVectors(db)
    const similarity = (a: string, b: string): number | null => {
      const va = vectors.get(a)
      const vb = vectors.get(b)
      if (va === undefined || vb === undefined) return null
      return cosine(va, vb)
    }

    const readings: StoredReading[] = derive({ startups, founders, similarity })

    db.run('DELETE FROM readings')
    const insert = db.query('INSERT INTO readings (id, kind, subject, value, lane, rule, why, basis) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    for (const r of readings) insert.run(r.id, r.kind, r.subject, JSON.stringify(r.value), r.lane, r.rule, r.why, r.basis)

    db.run('UPDATE startups SET display_name = NULL, legal_form = NULL')
    db.run('UPDATE founders SET display_name = NULL')
    const setStartup = db.query('UPDATE startups SET display_name = ?, legal_form = ? WHERE id = ?')
    const published = db.query<{ name: string }, [string]>('SELECT name FROM startups WHERE id = ?')
    const setFounder = db.query('UPDATE founders SET display_name = ? WHERE startup_id = ? AND position = ?')

    for (const r of readings) {
      if (r.kind === 'name') {
        const value = r.value as { display: string; legalForm: string | null }
        const name = published.get(r.subject)?.name
        setStartup.run(value.display !== name ? value.display : null, value.legalForm, r.subject)
      } else if (r.kind === 'founder') {
        const value = r.value as { display: string }
        const cut = r.subject.lastIndexOf('#')
        setFounder.run(value.display, r.subject.slice(0, cut), Number(r.subject.slice(cut + 1)))
      }
    }

    const counts: Record<Lane, number> = { rule: 0, inferred: 0, review: 0 }
    for (const r of readings) counts[r.lane] += 1
    const countOf = (sql: string) => db.query<{ n: number }, []>(sql).get()?.n ?? 0

    result = {
      total: readings.length,
      rule: counts.rule,
      inferred: counts.inferred,
      review: counts.review,
      displayNames: countOf('SELECT COUNT(*) AS n FROM startups WHERE display_name IS NOT NULL'),
      founderNames: countOf('SELECT COUNT(*) AS n FROM founders WHERE display_name IS NOT NULL'),
    }
  })()

  return result
}

/** The lane counts as run notes, in a fixed order; a lane with nothing to report is left out. */
export function laneNotes(result: StoreResult): RunNote[] {
  const all: RunNote[] = [
    { code: 'lane_rule', count: result.rule, text: 'readings settled by a rule' },
    { code: 'lane_inferred', count: result.inferred, text: 'readings inferred, shown with a qualifier' },
    { code: 'lane_review', count: result.review, text: 'readings that wait for a decision' },
  ]
  return all.filter((n) => n.count > 0)
}
