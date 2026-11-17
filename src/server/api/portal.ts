import { createServerFn } from '@tanstack/react-start'
import { getCookie } from '@tanstack/react-start/server'

import { getDatabase } from '../db'
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

export const startOperation = createServerFn({ method: 'POST' })
  .validator((operation: string) => operation)
  .handler(async ({ data }) => {
    requireOperator()
    if (data !== 'collect') throw new Error('Not built yet')
    return { runId: startRun(data) }
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
export type SnapshotDiff = { added: number; removed: number; changed: number; first: boolean }

// What a collect changed: rows matched by startup name against the snapshot before it.
function snapshotDiff(db: ReturnType<typeof getDatabase>, snapshotId: string): SnapshotDiff | null {
  const snap = db
    .query<{ fetched_at: string }, [string]>('SELECT fetched_at FROM source_snapshots WHERE id = ?')
    .get(snapshotId)
  if (!snap) return null
  const prev = db
    .query<{ id: string }, [string]>('SELECT id FROM source_snapshots WHERE fetched_at < ? ORDER BY fetched_at DESC LIMIT 1')
    .get(snap.fetched_at)
  if (!prev) return { added: 0, removed: 0, changed: 0, first: true }
  const rows = (id: string) =>
    new Map(
      db
        .query<{ k: string; raw: string }, [string]>(
          'SELECT lower(trim(r.name)) AS k, sr.raw_json AS raw FROM source_rows sr JOIN records r ON r.source_row_id = sr.id WHERE sr.snapshot_id = ?',
        )
        .all(id)
        .map((r) => [r.k, r.raw]),
    )
  const now = rows(snapshotId)
  const before = rows(prev.id)
  let added = 0
  let changed = 0
  for (const [k, raw] of now) {
    const old = before.get(k)
    if (old === undefined) added++
    else if (old !== raw) changed++
  }
  let removed = 0
  for (const k of before.keys()) if (!now.has(k)) removed++
  return { added, removed, changed, first: false }
}

export type PipelineRun = RunRow & {
  rows: number | null
  startups: number | null
  findings: number
  diff: SnapshotDiff | null
}

function runSummary(db: ReturnType<typeof getDatabase>, run: RunRow): PipelineRun {
  const snap = db
    .query<{ id: string; row_count: number }, [string]>('SELECT id, row_count FROM source_snapshots WHERE run_id = ?')
    .get(run.id)
  const startups = snap
    ? (db
        .query<{ n: number }, [string]>('SELECT COUNT(DISTINCT startup_id) AS n FROM records WHERE snapshot_id = ?')
        .get(snap.id)?.n ?? null)
    : null
  const findings =
    db.query<{ n: number }, [string]>('SELECT COUNT(*) AS n FROM review_items WHERE run_id = ?').get(run.id)?.n ?? 0
  return { ...run, rows: snap?.row_count ?? null, startups, findings, diff: snap ? snapshotDiff(db, snap.id) : null }
}

// The Pipeline page: where the registry stands, what each stage produced, every run and what it changed.
export const getPipeline = createServerFn().handler(async () => {
  requireOperator()
  recoverInterrupted()
  const db = getDatabase()
  const snapshot = db
    .query<{ id: string; fetched_at: string; row_count: number; byte_size: number; url: string; run_id: string | null }, []>(
      'SELECT id, fetched_at, row_count, byte_size, url, run_id FROM source_snapshots ORDER BY fetched_at DESC LIMIT 1',
    )
    .get()
  const count = (sql: string) => db.query<{ n: number }, [string]>(sql).get(snapshot?.id ?? '')?.n ?? 0
  const runs = db.query<RunRow, []>('SELECT * FROM runs ORDER BY started_at DESC LIMIT 50').all()
  const steps = snapshot?.run_id
    ? db.query<StepRow, [string]>('SELECT * FROM run_steps WHERE run_id = ? ORDER BY position').all(snapshot.run_id)
    : []
  return {
    snapshot,
    steps,
    collected: count('SELECT COUNT(*) AS n FROM source_rows WHERE snapshot_id = ?'),
    cleaned: count('SELECT COUNT(*) AS n FROM records WHERE snapshot_id = ?'),
    cleanChanges: db
      .query<{ field: string; why: string; count: number }, [string]>(
        "SELECT json_extract(c.value, '$.field') AS field, json_extract(c.value, '$.why') AS why, COUNT(*) AS count FROM records, json_each(records.changes_json) c WHERE records.snapshot_id = ? GROUP BY field, why ORDER BY count DESC",
      )
      .all(snapshot?.id ?? ''),
    merged: count('SELECT COUNT(DISTINCT startup_id) AS n FROM records WHERE snapshot_id = ?'),
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
    runs: runs.map((run) => runSummary(db, run)),
  }
})

export const getRunDetail = createServerFn()
  .validator((id: string) => id)
  .handler(async ({ data: id }) => {
    requireOperator()
    recoverInterrupted()
    const db = getDatabase()
    const run = db.query<RunRow, [string]>('SELECT * FROM runs WHERE id = ?').get(id)
    if (!run) return null
    const steps = db
      .query<StepRow, [string]>('SELECT * FROM run_steps WHERE run_id = ? ORDER BY position')
      .all(id)
    const reviews = db
      .query<{ code: string; count: number; open: number }, [string]>(
        "SELECT code, COUNT(*) AS count, SUM(status = 'open') AS open FROM review_items WHERE run_id = ? GROUP BY code ORDER BY count DESC",
      )
      .all(id)
    return { run: runSummary(db, run), steps, reviews }
  })
