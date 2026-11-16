import { createServerFn } from '@tanstack/react-start'
import { getCookie } from '@tanstack/react-start/server'

import { isProvider } from '#/shared/providers'
import { getDatabase } from '../db'
import { newId, now } from '../ids'
import { OPERATIONS } from '../pipeline/operations'
import { recoverInterrupted, startRun } from '../pipeline/runner'

// Every portal call is operator-only, checked on the server, not only in the UI.
function requireOperator() {
  if (getCookie('athar_role') !== 'operator')
    throw new Error('Operator role required')
}

export type RunRow = {
  id: string
  operation: string
  status: string
  started_at: string
  finished_at: string | null
  error: string | null
}
export type StepRow = {
  position: number
  step: string
  status: string
  started_at: string | null
  finished_at: string | null
  items_in: number | null
  items_out: number | null
  message: string | null
}

export const listRuns = createServerFn().handler(async () => {
  requireOperator()
  recoverInterrupted()
  const runs = getDatabase()
    .query<RunRow, []>('SELECT * FROM runs ORDER BY started_at DESC LIMIT 50')
    .all()
  return {
    runs,
    operations: OPERATIONS.map(({ id, label, description }) => ({
      id,
      label,
      description,
    })),
  }
})

// The run in flight (or the last one to finish), for the lab's status island.
export const getActiveRun = createServerFn().handler(async () => {
  requireOperator()
  recoverInterrupted()
  const db = getDatabase()
  const run = db
    .query<RunRow, []>('SELECT * FROM runs ORDER BY started_at DESC LIMIT 1')
    .get()
  if (!run) return null
  const steps = db
    .query<StepRow, [string]>(
      'SELECT * FROM run_steps WHERE run_id = ? ORDER BY position',
    )
    .all(run.id)
  return { run, steps }
})

export const getRun = createServerFn()
  .validator((id: string) => id)
  .handler(async ({ data: id }) => {
    requireOperator()
    recoverInterrupted()
    const db = getDatabase()
    const run = db
      .query<RunRow, [string]>('SELECT * FROM runs WHERE id = ?')
      .get(id)
    if (!run) return null
    const steps = db
      .query<StepRow, [string]>(
        'SELECT * FROM run_steps WHERE run_id = ? ORDER BY position',
      )
      .all(id)
    const reviews = db
      .query<{ code: string; count: number }, [string]>(
        'SELECT code, COUNT(*) AS count FROM review_items WHERE run_id = ? GROUP BY code ORDER BY count DESC',
      )
      .all(id)
    const sampleRow = db
      .query<{ id: string }, [string]>(
        'SELECT sr.id FROM source_rows sr JOIN source_snapshots ss ON ss.id = sr.snapshot_id WHERE ss.run_id = ? ORDER BY sr.row_number LIMIT 1',
      )
      .get(id)
    return { run, steps, reviews, sampleRowId: sampleRow?.id ?? null }
  })

export const startOperation = createServerFn({ method: 'POST' })
  .validator((operation: string) => operation)
  .handler(async ({ data }) => {
    requireOperator()
    if (data !== 'collect') throw new Error('Not built yet')
    return { runId: startRun(data) }
  })

type DisplayChange = {
  field: string
  from: string | null
  to: string | null
  why: string
}

// Values are shown as text: strings as they are, everything else as JSON.
function toDisplayChanges(json: string): DisplayChange[] {
  const text = (v: unknown) =>
    v === null || v === undefined
      ? null
      : typeof v === 'string'
        ? v
        : JSON.stringify(v)
  return (
    JSON.parse(json) as {
      field: string
      from: unknown
      to: unknown
      why: string
    }[]
  ).map((c) => ({
    field: c.field,
    from: text(c.from),
    to: text(c.to),
    why: c.why,
  }))
}

// Micro view: one source row followed through every step.
export const getTrace = createServerFn()
  .validator((rowId: string) => rowId)
  .handler(async ({ data: rowId }) => {
    requireOperator()
    const db = getDatabase()
    const row = db
      .query<
        {
          id: string
          row_number: number
          raw_json: string
          snapshot_id: string
          fetched_at: string
          content_hash: string
          run_id: string | null
        },
        [string]
      >(
        `SELECT sr.id, sr.row_number, sr.raw_json, sr.snapshot_id, ss.fetched_at, ss.content_hash, ss.run_id FROM source_rows sr
         JOIN source_snapshots ss ON ss.id = sr.snapshot_id WHERE sr.id = ?`,
      )
      .get(rowId)
    if (!row) return null
    const record = db
      .query<TraceRecord, [string]>(
        'SELECT * FROM records WHERE source_row_id = ?',
      )
      .get(rowId)
    const startup = record?.startup_id
      ? db
          .query<
            TraceRecord & { id: string; primary_row_id: string },
            [string]
          >('SELECT * FROM startups WHERE id = ?')
          .get(record.startup_id)
      : null
    const siblings = record?.startup_id
      ? db
          .query<TraceRecord & { row_number: number }, [string, string]>(
            'SELECT r.*, sr.row_number FROM records r JOIN source_rows sr ON sr.id = r.source_row_id WHERE r.startup_id = ? AND r.source_row_id != ? ORDER BY sr.row_number',
          )
          .all(record.startup_id, rowId)
      : []
    const reviews = db
      .query<
        { step: string; code: string; message: string; status: string },
        [string, string]
      >(
        'SELECT step, code, message, status FROM review_items WHERE source_row_id = ? OR startup_id = ? ORDER BY created_at',
      )
      .all(rowId, record?.startup_id ?? '')
    const prepared = record?.startup_id
      ? db
          .query<
            { language: string | null; text: string; removed_json: string },
            [string]
          >(
            'SELECT language, text, removed_json FROM prepared_texts WHERE startup_id = ?',
          )
          .get(record.startup_id)
      : null
    return {
      row,
      counts: {
        collected:
          db
            .query<{ n: number }, [string]>(
              'SELECT COUNT(*) AS n FROM source_rows WHERE snapshot_id = ?',
            )
            .get(row.snapshot_id)?.n ?? 0,
        cleaned:
          db
            .query<{ n: number }, [string]>(
              'SELECT COUNT(*) AS n FROM records WHERE snapshot_id = ?',
            )
            .get(row.snapshot_id)?.n ?? 0,
        merged:
          db
            .query<{ n: number }, [string]>(
              'SELECT COUNT(DISTINCT startup_id) AS n FROM records WHERE snapshot_id = ?',
            )
            .get(row.snapshot_id)?.n ?? 0,
        inReview:
          db
            .query<{ n: number }, [string]>(
              "SELECT COUNT(DISTINCT r.source_row_id) AS n FROM records r JOIN review_items ri ON ri.source_row_id = r.source_row_id OR ri.startup_id = r.startup_id WHERE r.snapshot_id = ? AND ri.status = 'open'",
            )
            .get(row.snapshot_id)?.n ?? 0,
      },
      changes: record ? toDisplayChanges(record.changes_json) : [],
      startup,
      siblings,
      record,
      operations: row.run_id
        ? db
            .query<StepRow & { run_id: string }, [string]>(
              'SELECT * FROM run_steps WHERE run_id = ? ORDER BY position',
            )
            .all(row.run_id)
        : [],
      reviews,
      prepared,
    }
  })

// Database view: read-only, every table, paged.
export const listTables = createServerFn().handler(async () => {
  requireOperator()
  const db = getDatabase()
  const tables = db
    .query<{ name: string }, []>(
      "SELECT name FROM sqlite_master WHERE type IN ('table') AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '%_fts%' AND name NOT LIKE 'startup_vectors%' ORDER BY name",
    )
    .all()
  return tables.map(({ name }) => ({
    name,
    rows:
      db.query<{ n: number }, []>(`SELECT COUNT(*) AS n FROM "${name}"`).get()
        ?.n ?? 0,
  }))
})

export const getTableRows = createServerFn()
  .validator((input: { table: string; page?: number }) => ({
    table: input.table,
    page: Math.max(0, input.page ?? 0),
  }))
  .handler(async ({ data }) => {
    requireOperator()
    const db = getDatabase()
    const known = db
      .query<{ name: string }, [string]>(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
      )
      .get(data.table)
    if (!known) throw new Error(`No table named ${data.table}`)
    const columns = db
      .query<{ name: string; type: string }, []>(
        `PRAGMA table_info("${known.name}")`,
      )
      .all()
    const blobs = new Set(
      columns.filter((c) => c.type === 'BLOB').map((c) => c.name),
    )
    const select = columns
      .map((c) =>
        blobs.has(c.name)
          ? `length("${c.name}") AS "${c.name}"`
          : `"${c.name}"`,
      )
      .join(', ')
    const rows = db
      .query<Record<string, string | number | null>, []>(
        `SELECT ${select} FROM "${known.name}" LIMIT 50 OFFSET ${data.page * 50}`,
      )
      .all()
    const masked: Record<string, string | number | null>[] =
      known.name === 'ai_keys'
        ? rows.map((r) => ({ ...r, api_key: '••••' }))
        : rows
    return {
      columns: columns.map((c) => c.name),
      rows: masked,
      page: data.page,
    }
  })

// Keys: provider, key and model; the key itself never goes back to the browser.
export const listKeys = createServerFn().handler(async () => {
  requireOperator()
  return getDatabase()
    .query<
      {
        id: string
        name: string
        provider: string
        model: string
        status: string
        hint: string
      },
      []
    >(
      "SELECT id, name, provider, model, status, '…' || substr(api_key, -4) AS hint FROM ai_keys ORDER BY created_at",
    )
    .all()
})

export const addKey = createServerFn({ method: 'POST' })
  .validator(
    (input: {
      name: string
      provider: string
      model: string
      apiKey: string
    }) => {
      if (!isProvider(input.provider))
        throw new Error(`Unknown provider: ${input.provider}`)
      if (!input.name.trim() || !input.model.trim() || !input.apiKey.trim())
        throw new Error('Name, model and key are required')
      return {
        ...input,
        name: input.name.trim(),
        model: input.model.trim(),
        apiKey: input.apiKey.trim(),
      }
    },
  )
  .handler(async ({ data }) => {
    requireOperator()
    getDatabase()
      .query(
        'INSERT INTO ai_keys (id, name, provider, model, api_key, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      )
      .run(
        newId(),
        data.name,
        data.provider,
        data.model,
        data.apiKey,
        now(),
        now(),
      )
  })

export const removeKey = createServerFn({ method: 'POST' })
  .validator((id: string) => id)
  .handler(async ({ data }) => {
    requireOperator()
    getDatabase().query('DELETE FROM ai_keys WHERE id = ?').run(data)
  })

// Review queue: what the pipeline could not settle alone.
export const listReviews = createServerFn()
  .validator((input: { status?: string; code?: string }) => ({
    status: input.status ?? 'open',
    code: input.code ?? '',
  }))
  .handler(async ({ data }) => {
    requireOperator()
    const db = getDatabase()
    const items = db
      .query<
        {
          id: string
          code: string
          step: string
          message: string
          status: string
          created_at: string
          source_row_id: string | null
          startup_id: string | null
          row_number: number | null
          name: string | null
          sector: string | null
          cohort: string | null
          raw_website: string | null
        },
        { $status: string; $code: string }
      >(
        `SELECT ri.id, ri.code, ri.step, ri.message, ri.status, ri.created_at, COALESCE(ri.source_row_id, s.primary_row_id) AS source_row_id, sr.row_number, COALESCE(s.name, r.name) AS name, COALESCE(ri.startup_id, r.startup_id) AS startup_id, r.sector, r.cohort, json_extract(sr.raw_json, '$.website') AS raw_website
         FROM review_items ri LEFT JOIN records r ON r.source_row_id = ri.source_row_id
         LEFT JOIN startups s ON s.id = COALESCE(ri.startup_id, r.startup_id)
         LEFT JOIN source_rows sr ON sr.id = COALESCE(ri.source_row_id, s.primary_row_id)
         WHERE ri.status = $status AND ($code = '' OR ri.code = $code) ORDER BY sr.row_number`,
      )
      .all({ $status: data.status, $code: data.code })
    const counts = db
      .query<{ code: string; status: string; count: number }, []>(
        'SELECT code, status, COUNT(*) AS count FROM review_items GROUP BY code, status',
      )
      .all()
    return { items, counts, status: data.status, code: data.code }
  })

export const setReviewStatus = createServerFn({ method: 'POST' })
  .validator(
    (input: { ids: string[]; status: 'open' | 'resolved' | 'dismissed' }) =>
      input,
  )
  .handler(async ({ data }) => {
    requireOperator()
    const db = getDatabase()
    const q = db.query('UPDATE review_items SET status = ? WHERE id = ?')
    db.transaction(() => data.ids.forEach((id) => q.run(data.status, id)))()
  })

// Trace picker: find a source row by registry row number or name.
export const findRows = createServerFn()
  .validator((q: string) => q.trim())
  .handler(async ({ data }) => {
    requireOperator()
    const db = getDatabase()
    const latest = db
      .query<{ id: string }, []>(
        'SELECT id FROM source_snapshots ORDER BY fetched_at DESC LIMIT 1',
      )
      .get()
    if (!latest) return []
    const asNumber = /^\d+$/.test(data) ? Number(data) : -1
    return db
      .query<
        {
          id: string
          row_number: number
          name: string
          sector: string | null
          changes: number
          startup_id: string | null
        },
        { $snap: string; $q: string; $n: number }
      >(
        `SELECT sr.id, sr.row_number, COALESCE(r.name, json_extract(sr.raw_json, '$.name'), 'Unnamed source row') AS name, r.sector, COALESCE(json_array_length(r.changes_json), 0) AS changes, r.startup_id
         FROM source_rows sr LEFT JOIN records r ON r.source_row_id = sr.id
         WHERE sr.snapshot_id = $snap AND ($q = '' OR sr.row_number = $n OR COALESCE(r.name, json_extract(sr.raw_json, '$.name')) LIKE '%' || $q || '%')
         ORDER BY sr.row_number LIMIT 60`,
      )
      .all({ $snap: latest.id, $q: data, $n: asNumber })
  })

type TraceRecord = {
  source_row_id: string
  startup_id: string | null
  changes_json: string
  name: string
  description: string | null
  sector: string | null
  website: string | null
  domain: string | null
  founders_json: string
  cohort: string | null
  creation_year: number | null
}

// Current snapshot counts and the real work waiting for the operator.
export const getPortalOverview = createServerFn().handler(async () => {
  requireOperator()
  recoverInterrupted()
  const db = getDatabase()
  const snapshot = db
    .query<{ id: string; fetched_at: string; row_count: number }, []>(
      'SELECT id, fetched_at, row_count FROM source_snapshots ORDER BY fetched_at DESC LIMIT 1',
    )
    .get()
  const count = (sql: string) =>
    db.query<{ n: number }, [string]>(sql).get(snapshot?.id ?? '')?.n ?? 0
  return {
    snapshot,
    collected: count(
      'SELECT COUNT(*) AS n FROM source_rows WHERE snapshot_id = ?',
    ),
    cleaned: count('SELECT COUNT(*) AS n FROM records WHERE snapshot_id = ?'),
    merged: count(
      'SELECT COUNT(DISTINCT startup_id) AS n FROM records WHERE snapshot_id = ?',
    ),
    inReview:
      db
        .query<{ n: number }, []>(
          "SELECT COUNT(DISTINCT r.source_row_id) AS n FROM records r JOIN review_items ri ON ri.source_row_id = r.source_row_id OR ri.startup_id = r.startup_id WHERE ri.status = 'open'",
        )
        .get()?.n ?? 0,
    findings: db
      .query<{ code: string; count: number }, []>(
        "SELECT code, COUNT(*) AS count FROM review_items WHERE status = 'open' GROUP BY code ORDER BY count DESC",
      )
      .all(),
    runs: db
      .query<RunRow, []>('SELECT * FROM runs ORDER BY started_at DESC LIMIT 5')
      .all(),
    keys: db.query<{ n: number }, []>('SELECT COUNT(*) AS n FROM ai_keys').get()?.n ?? 0,
    lastCollect: db
      .query<{ finished_at: string | null; status: string }, []>(
        "SELECT finished_at, status FROM runs WHERE operation = 'collect' ORDER BY started_at DESC LIMIT 1",
      )
      .get(),
  }
})
