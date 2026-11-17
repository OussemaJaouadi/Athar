import { createServerFn } from '@tanstack/react-start'
import { getCookie } from '@tanstack/react-start/server'

import { getDatabase } from '../db'
import { now } from '../ids'

// Every review call is operator-only, checked on the server, not only in the UI.
function requireOperator() {
  if (getCookie('athar_role') !== 'operator') throw new Error('Operator role required')
}

export type ReviewStatus = 'open' | 'resolved' | 'dismissed'

export type Duplicate = { startup_id: string; name: string; website: string | null; row_id: string | null; row_number: number | null }

export type ReviewItem = {
  id: string
  code: string
  step: string
  message: string
  status: ReviewStatus
  note: string | null
  decided_at: string | null
  decided_by: string | null
  created_at: string
  source_row_id: string | null
  startup_id: string | null
  row_number: number | null
  name: string | null
  sector: string | null
  creation_year: number | null
  website: string | null
  founders: number
  raw_website: string | null
  raw_industry: string | null
  raw_sector: string | null
  raw_label: string | null
  raw_creation_year: string | null
  raw_desc: string | null
  /** What cleaning did to the row, as stored: [{ field, from, to, why }]. */
  changes_json: string | null
  /** The row exactly as downloaded. */
  raw_json: string | null
  others: Duplicate[]
}

/** The queue's two views: open findings, and decided ones (fixed at source or kept as is). */
export type ReviewView = 'open' | 'decided'

const STATUSES: ReviewStatus[] = ['open', 'resolved', 'dismissed']

/** The queue for one status, with the evidence each finding needs to be decided without leaving the page. */
export const listReviewQueue = createServerFn()
  .validator((input: { status?: string }) => ({
    view: (input.status === 'decided' || input.status === 'resolved' || input.status === 'dismissed' ? 'decided' : 'open') as ReviewView,
  }))
  .handler(async ({ data }) => {
    requireOperator()
    const db = getDatabase()
    const rows = db
      .query<Omit<ReviewItem, 'others'> & { founders_json: string | null }, { $status: string }>(
        `SELECT ri.id, ri.code, ri.step, ri.message, ri.status, ri.note, ri.decided_at, ri.decided_by, ri.created_at,
                COALESCE(ri.source_row_id, s.primary_row_id) AS source_row_id,
                COALESCE(ri.startup_id, r.startup_id) AS startup_id,
                sr.row_number, COALESCE(s.name, r.name) AS name, COALESCE(r.sector, s.sector) AS sector,
                COALESCE(r.creation_year, s.creation_year) AS creation_year, COALESCE(r.website, s.website) AS website,
                COALESCE(r.founders_json, s.founders_json) AS founders_json,
                json_extract(sr.raw_json, '$.website') AS raw_website,
                json_extract(sr.raw_json, '$.industry') AS raw_industry,
                json_extract(sr.raw_json, '$.sector') AS raw_sector,
                json_extract(sr.raw_json, '$.label') AS raw_label,
                CAST(json_extract(sr.raw_json, '$.creation_year') AS TEXT) AS raw_creation_year,
                json_extract(sr.raw_json, '$.desc') AS raw_desc,
                r.changes_json, sr.raw_json
         FROM review_items ri
         LEFT JOIN records r ON r.source_row_id = ri.source_row_id
         LEFT JOIN startups s ON s.id = COALESCE(ri.startup_id, r.startup_id)
         LEFT JOIN source_rows sr ON sr.id = COALESCE(ri.source_row_id, s.primary_row_id)
         WHERE ($status = 'open' AND ri.status = 'open') OR ($status = 'decided' AND ri.status <> 'open')
         ORDER BY ri.code, COALESCE(ri.decided_at, '') DESC, sr.row_number`,
      )
      .all({ $status: data.view })

    // A possible duplicate shows the other startups that carry the same name.
    const sameName = db.query<Duplicate, [string, string]>(
      `SELECT s.id AS startup_id, s.name, s.website, s.primary_row_id AS row_id, sr.row_number
       FROM startups s LEFT JOIN source_rows sr ON sr.id = s.primary_row_id
       WHERE lower(trim(s.name)) = lower(trim(?)) AND s.id <> ? ORDER BY sr.row_number`,
    )
    const items: ReviewItem[] = rows.map(({ founders_json, ...row }) => {
      let founders = 0
      try {
        const list = JSON.parse(founders_json ?? '[]')
        founders = Array.isArray(list) ? list.length : 0
      } catch {}
      return {
        ...row,
        founders,
        others: row.code === 'possible_duplicate' && row.name && row.startup_id ? sameName.all(row.name, row.startup_id) : [],
      }
    })

    const counts = db
      .query<{ code: string; status: string; count: number }, []>(
        'SELECT code, status, COUNT(*) AS count FROM review_items GROUP BY code, status',
      )
      .all()
    const snapshot = db
      .query<{ fetched_at: string; row_count: number }, []>('SELECT fetched_at, row_count FROM source_snapshots ORDER BY fetched_at DESC LIMIT 1')
      .get()
    return { items, counts, view: data.view, snapshot }
  })

type Previous = { id: string; status: string; note: string | null; decided_at: string | null; decided_by: string | null }

/**
 * Decide findings: resolved (fixed at source), dismissed (kept as a known gap) or reopened.
 * Returns what each row was before, so the toast can undo it.
 */
export const decideReviews = createServerFn({ method: 'POST' })
  .validator((input: { ids: string[]; status: ReviewStatus; note?: string }) => {
    if (!Array.isArray(input.ids) || !input.ids.length) throw new Error('Pick at least one finding')
    if (!STATUSES.includes(input.status)) throw new Error('Unknown status')
    return { ids: input.ids.map(String), status: input.status, note: input.note?.trim().slice(0, 280) || null }
  })
  .handler(async ({ data }) => {
    requireOperator()
    const db = getDatabase()
    const read = db.query<Previous, [string]>('SELECT id, status, note, decided_at, decided_by FROM review_items WHERE id = ?')
    const write = db.query('UPDATE review_items SET status = ?, note = ?, decided_at = ?, decided_by = ? WHERE id = ?')
    const at = now()
    const previous: Previous[] = []
    db.transaction(() => {
      for (const id of data.ids) {
        const before = read.get(id)
        if (!before) continue
        previous.push(before)
        if (data.status === 'open') write.run('open', null, null, null, id)
        else write.run(data.status, data.note, at, 'operator', id)
      }
    })()
    return { count: previous.length, previous }
  })

/** Undo a decision: put each row back exactly as it was. */
export const restoreReviews = createServerFn({ method: 'POST' })
  .validator((input: { previous: Previous[] }) => input)
  .handler(async ({ data }) => {
    requireOperator()
    const db = getDatabase()
    const write = db.query('UPDATE review_items SET status = ?, note = ?, decided_at = ?, decided_by = ? WHERE id = ?')
    db.transaction(() => {
      for (const p of data.previous)
        if ((STATUSES as string[]).includes(p.status)) write.run(p.status, p.note, p.decided_at, p.decided_by, p.id)
    })()
    return { count: data.previous.length }
  })
