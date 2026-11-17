import { createServerFn } from '@tanstack/react-start'
import { getCookie } from '@tanstack/react-start/server'

import { getDatabase } from '../db'
import { OPERATIONS, getOperation } from '../pipeline/operations'
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
    if (!getOperation(data)) throw new Error(`Unknown operation: ${data}`)
    return { runId: startRun(data) }
  })

export type RunNote = { code: string; count: number; text: string }
export type StepView = StepRow & { notes: RunNote[] }

const TALLIES = new Set(['startups_new', 'startups_changed', 'startups_unchanged'])
const parseNotes = (json: string | null | undefined): RunNote[] => {
  if (!json) return []
  try {
    const v = JSON.parse(json) as unknown
    return Array.isArray(v) ? (v as RunNote[]).filter((n) => n && typeof n.count === 'number' && typeof n.text === 'string') : []
  } catch {
    return []
  }
}

/**
 * What a run did to the registry, in the operator's words:
 * - `stored`: it saved a new download (with entry and startup tallies),
 * - `confirmed`: the registry published the same rows, so only the last download's check time moved,
 * - `legacy`: the run used the pipeline before v2, whose tables were replaced,
 * - `none`: it failed or is still running.
 */
export type RunChange =
  | { kind: 'stored'; download: number; fetchedAt: string; rows: number; entriesNew: number; entriesWithdrawn: number; startups: { created: number; changed: number; unchanged: number } | null }
  | { kind: 'confirmed'; sameAs: string }
  | { kind: 'legacy' }
  | { kind: 'none' }

export type PipelineRun = RunRow & { rows: number | null; startups: number | null; change: RunChange }

function runSummary(db: ReturnType<typeof getDatabase>, run: RunRow): PipelineRun {
  const steps = db
    .query<{ step: string; status: string; message: string | null; items_in: number | null; items_out: number | null; notes_json: string | null }, [string]>(
      'SELECT step, status, message, items_in, items_out, notes_json FROM run_steps WHERE run_id = ? ORDER BY position',
    )
    .all(run.id)
  const collect = steps.find((s) => s.step === 'collect')
  const build = steps.find((s) => s.step === 'build')
  const download = db
    .query<{ id: number; fetched_at: string; row_count: number }, [string]>('SELECT id, fetched_at, row_count FROM downloads WHERE run_id = ?')
    .get(run.id)

  let change: RunChange = { kind: 'none' }
  if (!build && steps.some((s) => s.step === 'clean' || s.step === 'merge')) change = { kind: 'legacy' }
  else if (download) {
    const notes = parseNotes(collect?.notes_json)
    const n = (code: string) => notes.find((x) => x.code === code)?.count ?? 0
    // Build counts its startups as notes (startups_new / _changed / _unchanged). Runs stored before those notes
    // existed have no tally, and the page then shows none rather than guessing from the message.
    const built = parseNotes(build?.notes_json)
    const count = (code: string) => built.find((n) => n.code === code)?.count
    const tally = count('startups_new') !== undefined ? [count('startups_new')!, count('startups_changed') ?? 0, count('startups_unchanged') ?? 0] : null
    change = {
      kind: 'stored',
      download: download.id,
      fetchedAt: download.fetched_at,
      rows: download.row_count,
      entriesNew: n('entries_new'),
      entriesWithdrawn: n('entries_withdrawn'),
      startups: tally ? { created: tally[0], changed: tally[1], unchanged: tally[2] } : null,
    }
  } else if (run.status === 'done' && collect?.message?.startsWith('Same rows')) {
    change = { kind: 'confirmed', sameAs: collect.message.match(/download of (\S+);/)?.[1] ?? '' }
  }
  return {
    ...run,
    rows: collect?.items_in ?? null,
    startups: build?.status === 'done' ? (build.items_out ?? null) : null,
    change,
  }
}

// The Pipeline page: where the registry stands (latest download, entries, startups) and every run.
export const getPipeline = createServerFn().handler(async () => {
  requireOperator()
  recoverInterrupted()
  const db = getDatabase()
  const download = db
    .query<{ id: number; fetched_at: string; last_checked_at: string; row_count: number }, []>(
      'SELECT id, fetched_at, last_checked_at, row_count FROM downloads ORDER BY id DESC LIMIT 1',
    )
    .get()
  const latest = download?.id ?? -1
  const one = (sql: string) => db.query<{ n: number }, [number]>(sql).get(latest)?.n ?? 0
  const runs = db.query<RunRow, []>('SELECT * FROM runs ORDER BY started_at DESC LIMIT 50').all()
  return {
    download,
    // entries the latest download published, startups built, and startups the registry no longer publishes
    entries: one('SELECT COUNT(*) AS n FROM entries WHERE last_download = ?'),
    startups: db.query<{ n: number }, []>('SELECT COUNT(*) AS n FROM startups').get()?.n ?? 0,
    withdrawn: one('SELECT COUNT(*) AS n FROM startups WHERE last_download < ?'),
    runs: runs.map((run) => runSummary(db, run)),
    // What the operator can start. Prepare is the only one that needs something first: an active AI key.
    operations: OPERATIONS.map((o) => ({ id: o.id, label: o.label, description: o.description })),
    hasKey: !!db.query<{ id: string }, []>("SELECT id FROM ai_keys WHERE status = 'active' LIMIT 1").get(),
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
    const steps: StepView[] = db
      .query<StepRow & { notes_json: string | null }, [string]>('SELECT * FROM run_steps WHERE run_id = ? ORDER BY position')
      .all(id)
      // The startup tallies are told once, under "What changed"; the step's notes list keeps the facts.
      .map(({ notes_json, ...s }) => ({ ...s, notes: parseNotes(notes_json).filter((n) => !TALLIES.has(n.code)) }))
    return { run: runSummary(db, run), steps }
  })
