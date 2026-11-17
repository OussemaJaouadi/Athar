import type { Database } from 'bun:sqlite'

import { now, sha256 } from '../ids'
import { REGISTRY, USED_FIELDS } from './registry'
import type { RunNote, Step, StepResult } from './types'

const MAX_BYTES = 64 * 1024 * 1024
const ID_LENGTH = 12

// Key order must not change an entry's identity, so the hash is taken over sorted keys.
const canonical = (value: unknown): string =>
  JSON.stringify(value, (_key, v) =>
    v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : 1))) : v,
  )

/** The id of a registry row: the start of the SHA-256 of its content. Same row, same id, in every download. */
export const entryId = (row: unknown) => sha256(canonical(row)).slice(0, ID_LENGTH)

function assertShape(rows: unknown): asserts rows is Record<string, unknown>[] {
  if (!Array.isArray(rows)) throw new Error('The registry response is not a list')
  if (!rows.length) throw new Error('The registry returned no rows')
  for (const row of rows) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error('A registry row is not an object')
    for (const field of USED_FIELDS) if (!(field in row)) throw new Error(`The registry no longer publishes the field "${field}"`)
    const r = row as Record<string, unknown>
    if (typeof r.name !== 'string' || !r.name.trim()) throw new Error('A registry row has no name')
    if (!Array.isArray(r.founders)) throw new Error('A registry row has founders that are not a list')
  }
}

/**
 * Stores one download. Split from the network call so a saved body can be replayed.
 * An identical download stores nothing; a different one adds only the rows not seen before.
 */
export function ingest(db: Database, body: Uint8Array, runId: string | null, at = now()): StepResult {
  const rows: unknown = JSON.parse(new TextDecoder().decode(body))
  assertShape(rows)

  const seen = new Map<string, { raw: string; copies: number }>()
  for (const row of rows) {
    const id = entryId(row)
    const entry = seen.get(id)
    if (entry) entry.copies++
    else seen.set(id, { raw: JSON.stringify(row), copies: 1 })
  }
  // The registry returns its rows in a different order on every request, so the bytes always differ.
  // What was published is the set of rows: the hash is taken over the sorted entry ids.
  const hash = sha256([...seen].map(([id, e]) => `${id}x${e.copies}`).sort().join('\n'))

  const latest = db
    .query<{ id: number; content_hash: string; fetched_at: string; row_count: number }, []>(
      'SELECT id, content_hash, fetched_at, row_count FROM downloads ORDER BY id DESC LIMIT 1',
    )
    .get()
  if (latest?.content_hash === hash) {
    db.query('UPDATE downloads SET last_checked_at = ? WHERE id = ?').run(at, latest.id)
    return { itemsIn: rows.length, itemsOut: 0, message: `Same rows as the download of ${latest.fetched_at.slice(0, 10)}; nothing stored` }
  }
  // A registry outage that returns a short list must not make hundreds of startups look withdrawn.
  if (latest && rows.length < latest.row_count / 2)
    throw new Error(`The registry returned ${rows.length} rows; the previous download had ${latest.row_count}. Refused.`)

  const known = new Map(db.query<{ id: string; raw_json: string }, []>('SELECT id, raw_json FROM entries').all().map((e) => [e.id, e.raw_json]))
  let added = 0
  let withdrawn = 0

  db.transaction(() => {
    const download = db
      .query<{ id: number }, [string, string, string, string, number, number, string | null]>(
        `INSERT INTO downloads (url, fetched_at, last_checked_at, content_hash, byte_size, row_count, run_id)
         VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id`,
      )
      .get(REGISTRY.url, at, at, hash, body.byteLength, rows.length, runId)!.id
    const insert = db.query('INSERT INTO entries (id, raw_json, copies, first_download, last_download) VALUES (?, ?, ?, ?, ?)')
    const touch = db.query('UPDATE entries SET last_download = ?, copies = ? WHERE id = ?')
    for (const [id, entry] of seen) {
      const stored = known.get(id)
      if (stored === undefined) {
        insert.run(id, entry.raw, entry.copies, download, download)
        added++
      } else {
        if (canonical(JSON.parse(stored)) !== canonical(JSON.parse(entry.raw))) throw new Error(`Two different rows share the id ${id}`)
        touch.run(download, entry.copies, id)
      }
    }
    if (latest)
      withdrawn = db.query<{ n: number }, [number]>('SELECT COUNT(*) AS n FROM entries WHERE last_download = ?').get(latest.id)?.n ?? 0
  })()

  const count = (test: (r: Record<string, unknown>) => boolean) => rows.filter(test).length
  const copies = rows.length - seen.size
  const expected = new Set<string>([...USED_FIELDS, 'industry', 'logo', 'logo_id', 'email', 'phone'])
  const unknown = [...new Set(rows.flatMap((r) => Object.keys(r)))].filter((k) => !expected.has(k))
  const industry = count((r) => r.industry !== r.sector)
  const logos = new Set(rows.map((r) => r.logo)).size
  const logoIds = count((r) => r.logo_id != null)

  const notes: RunNote[] = [
    { code: 'entries_new', count: added, text: 'rows not seen in any earlier download' },
    { code: 'entries_withdrawn', count: withdrawn, text: 'rows of the previous download no longer published' },
    { code: 'exact_copies', count: copies, text: 'rows published more than once, character for character; stored once' },
    { code: 'unknown_fields', count: unknown.length, text: `fields the registry added: ${unknown.join(', ')}` },
    { code: 'industry_differs', count: industry, text: 'rows where industry differs from sector; industry is not read' },
    { code: 'logo_varies', count: logos > 1 ? logos : 0, text: 'different logo images; logo is not read' },
    { code: 'logo_id_set', count: logoIds, text: 'rows with a logo id; logo id is not read' },
  ].filter((n) => n.count > 0)

  return {
    itemsIn: rows.length,
    itemsOut: added,
    message: latest ? `${rows.length} rows; ${added} new, ${withdrawn} no longer published` : `${rows.length} rows; ${seen.size} distinct entries stored`,
    notes,
  }
}

// Collect: download the registry and keep every distinct row verbatim.
export const collect: Step = {
  name: 'collect',
  label: 'Download the registry',
  async run({ db, runId }) {
    const res = await fetch(REGISTRY.url, { headers: { accept: 'application/json', 'user-agent': REGISTRY.userAgent } })
    if (!res.ok) throw new Error(`Registry answered ${res.status} ${res.statusText}`)
    const body = new Uint8Array(await res.arrayBuffer())
    if (body.byteLength > MAX_BYTES) throw new Error(`Registry response is ${body.byteLength} bytes, over the limit`)
    return ingest(db, body, runId)
  },
}
