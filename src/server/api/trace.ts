import { createServerFn } from '@tanstack/react-start'
import { getCookie } from '@tanstack/react-start/server'

import type { Database } from 'bun:sqlite'

import { getDatabase } from '../db'

// Every trace call is operator-only, checked on the server, not only in the UI.
function requireOperator() {
  if (getCookie('athar_role') !== 'operator') throw new Error('Operator role required')
}

type Db = Database

const latestSnapshot = (db: Db) =>
  db.query<{ id: string }, []>('SELECT id FROM source_snapshots ORDER BY fetched_at DESC LIMIT 1').get()

/** Parse stored JSON without letting one bad row blank the page. */
export function safeJson<T>(text: string | null | undefined, fallback: T): T {
  if (!text) return fallback
  try {
    return JSON.parse(text) as T
  } catch {
    return fallback
  }
}

export type TraceHit = {
  id: string
  row_number: number
  name: string
  sector: string | null
  changes: number
  open: number
}

const OPEN_FOR_ROW = `(SELECT COUNT(*) FROM review_items ri WHERE ri.status = 'open' AND (ri.source_row_id = sr.id OR (r.startup_id IS NOT NULL AND ri.startup_id = r.startup_id)))`

// Changes that every row gets (placeholder logo, industry copied from sector) are not news for one row.
const ROUTINE = `(SELECT COUNT(*) FROM json_each(r.changes_json) c WHERE json_extract(c.value, '$.field') NOT IN ('logo', 'industry'))`

/**
 * The trace picker. A number matches that registry row exactly; text matches names. With no query, rows with open
 * findings come first. Returns the first 60 and the full count.
 */
export const findTraceRows = createServerFn()
  .validator((q: string) => q.trim())
  .handler(async ({ data: q }) => {
    requireOperator()
    const db = getDatabase()
    const snap = latestSnapshot(db)
    if (!snap) return { hits: [] as TraceHit[], total: 0, snapshotRows: 0 }
    const n = /^\d+$/.test(q) ? Number(q) : -1
    const where = `sr.snapshot_id = $snap AND ($q = '' OR sr.row_number = $n OR COALESCE(r.name, json_extract(sr.raw_json, '$.name')) LIKE '%' || $q || '%')`
    const params = { $snap: snap.id, $q: q, $n: n }
    const total =
      db
        .query<{ n: number }, typeof params>(`SELECT COUNT(*) AS n FROM source_rows sr LEFT JOIN records r ON r.source_row_id = sr.id WHERE ${where}`)
        .get(params)?.n ?? 0
    const hits = db
      .query<TraceHit, typeof params>(
        `SELECT sr.id, sr.row_number, COALESCE(r.name, json_extract(sr.raw_json, '$.name'), 'Unnamed source row') AS name, r.sector,
                COALESCE(${ROUTINE}, 0) AS changes, ${OPEN_FOR_ROW} AS open
         FROM source_rows sr LEFT JOIN records r ON r.source_row_id = sr.id
         WHERE ${where}
         ORDER BY (sr.row_number = $n) DESC, ${q ? '' : 'open > 0 DESC, '}sr.row_number
         LIMIT 60`,
      )
      .all(params)
    const snapshotRows =
      db.query<{ n: number }, [string]>('SELECT COUNT(*) AS n FROM source_rows WHERE snapshot_id = ?').get(snap.id)?.n ?? 0
    return { hits, total, snapshotRows }
  })

/** Exact registry row number in the latest snapshot → its source row id. */
export const rowByNumber = createServerFn()
  .validator((n: number) => n)
  .handler(async ({ data: n }) => {
    requireOperator()
    const db = getDatabase()
    const snap = latestSnapshot(db)
    if (!snap) return null
    return (
      db
        .query<{ id: string }, [string, number]>('SELECT id FROM source_rows WHERE snapshot_id = ? AND row_number = ?')
        .get(snap.id, n)?.id ?? null
    )
  })

export type TraceValues = {
  name: string | null
  description: string | null
  sector: string | null
  website: string | null
  founders: string[]
  cohort: string | null
  creation_year: number | null
}

type RecordRow = {
  source_row_id: string
  startup_id: string | null
  changes_json: string
  name: string
  description: string | null
  sector: string | null
  website: string | null
  founders_json: string
  cohort: string | null
  creation_year: number | null
}

const values = (r: Omit<RecordRow, 'source_row_id' | 'startup_id' | 'changes_json'>): TraceValues => ({
  name: r.name,
  description: r.description,
  sector: r.sector,
  website: r.website,
  founders: safeJson<unknown[]>(r.founders_json, []).map(String),
  cohort: r.cohort,
  creation_year: r.creation_year,
})

const text = (v: unknown) => (v === null || v === undefined ? null : typeof v === 'string' ? v : JSON.stringify(v))

function rawView(json: string): { rawFields: [string, string][]; pretty: string; rawValid: boolean } {
  const raw = safeJson<Record<string, unknown> | null>(json, null)
  if (!raw || typeof raw !== 'object') return { rawFields: [], pretty: json, rawValid: false }
  const words = (v: unknown): string =>
    v === null || v === undefined ? '' : Array.isArray(v) ? v.map(words).filter(Boolean).join(', ') : typeof v === 'object' ? JSON.stringify(v) : String(v)
  return { rawFields: Object.entries(raw).map(([k, v]) => [k, words(v)]), pretty: JSON.stringify(raw, null, 2), rawValid: true }
}

type Step = { step: string; started_at: string | null; finished_at: string | null }

/** One source row followed from the download to its startup, with its neighbours for paging. */
export const getTraceRow = createServerFn()
  .validator((rowId: string) => rowId)
  .handler(async ({ data: rowId }) => {
    requireOperator()
    const db = getDatabase()
    const row = db
      .query<
        { id: string; row_number: number; raw_json: string; snapshot_id: string; fetched_at: string; content_hash: string; run_id: string | null; url: string },
        [string]
      >(
        `SELECT sr.id, sr.row_number, sr.raw_json, sr.snapshot_id, ss.fetched_at, ss.content_hash, ss.run_id, ss.url
         FROM source_rows sr JOIN source_snapshots ss ON ss.id = sr.snapshot_id WHERE sr.id = ?`,
      )
      .get(rowId)
    if (!row) return null

    const neighbour = (op: '<' | '>') =>
      db
        .query<{ id: string; row_number: number }, [string, number]>(
          `SELECT id, row_number FROM source_rows WHERE snapshot_id = ? AND row_number ${op} ? ORDER BY row_number ${op === '<' ? 'DESC' : 'ASC'} LIMIT 1`,
        )
        .get(row.snapshot_id, row.row_number)
    const lastRow =
      db.query<{ n: number }, [string]>('SELECT MAX(row_number) AS n FROM source_rows WHERE snapshot_id = ?').get(row.snapshot_id)?.n ?? row.row_number

    const record = db.query<RecordRow, [string]>('SELECT * FROM records WHERE source_row_id = ?').get(rowId)
    const changes = safeJson<{ field: string; from: unknown; to: unknown; why: string }[]>(record?.changes_json, []).map((c) => ({
      field: c.field,
      from: text(c.from),
      to: text(c.to),
      why: c.why,
    }))

    const startup = record?.startup_id
      ? db
          .query<RecordRow & { id: string; primary_row_id: string | null; website_status: string | null }, [string]>('SELECT * FROM startups WHERE id = ?')
          .get(record.startup_id)
      : null
    const merged = record?.startup_id
      ? db
          .query<RecordRow & { row_number: number }, [string]>(
            'SELECT r.*, sr.row_number FROM records r JOIN source_rows sr ON sr.id = r.source_row_id WHERE r.startup_id = ? ORDER BY sr.row_number',
          )
          .all(record.startup_id)
          .map((r) => ({ id: r.source_row_id, row_number: r.row_number, values: values(r) }))
      : []

    const findings = db
      .query<{ id: string; step: string; code: string; message: string; status: string; created_at: string }, [string, string]>(
        'SELECT id, step, code, message, status, created_at FROM review_items WHERE source_row_id = ? OR startup_id = ? ORDER BY created_at',
      )
      .all(rowId, record?.startup_id ?? '')

    const steps = row.run_id
      ? db.query<Step, [string]>('SELECT step, started_at, finished_at FROM run_steps WHERE run_id = ? ORDER BY position').all(row.run_id)
      : []

    return {
      row,
      // Plain strings only: the raw row's fields as words, and the row pretty-printed (or as stored, if it is not JSON).
      ...rawView(row.raw_json),
      prev: neighbour('<'),
      next: neighbour('>'),
      lastRow,
      record: record ? values(record) : null,
      changes,
      startup: startup ? { id: startup.id, primary_row_id: startup.primary_row_id, website_status: startup.website_status, values: values(startup) } : null,
      merged,
      findings,
      steps,
    }
  })
