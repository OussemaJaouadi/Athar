import { getDatabase } from '../db'
import { newId, now } from '../ids'
import { getOperation } from './operations'
import type { StepContext } from './types'

let recovered = false

// A run left "running" by a stopped server can never finish; say so instead of pretending.
function recoverInterrupted() {
  if (recovered) return
  recovered = true
  const db = getDatabase()
  db.query("UPDATE run_steps SET status = 'interrupted' WHERE status IN ('running', 'pending') AND run_id IN (SELECT id FROM runs WHERE status = 'running')").run()
  db.query("UPDATE runs SET status = 'interrupted', finished_at = ?, error = 'The server stopped during this run' WHERE status = 'running'").run(now())
}

/** Starts an operation in the background and returns its run id at once. */
export function startRun(operationId: string): string {
  recoverInterrupted()
  const db = getDatabase()
  const operation = getOperation(operationId)
  if (!operation) throw new Error(`Unknown operation: ${operationId}`)
  const active = db.query<{ id: string }, []>("SELECT id FROM runs WHERE status = 'running'").get()
  if (active) throw new Error('Another run is still in progress')

  const runId = newId()
  db.transaction(() => {
    db.query("INSERT INTO runs (id, operation, status, started_at) VALUES (?, ?, 'running', ?)").run(runId, operation.id, now())
    const step = db.query("INSERT INTO run_steps (run_id, position, step, status) VALUES (?, ?, ?, 'pending')")
    operation.steps.forEach((s, i) => step.run(runId, i, s.name))
  })()

  void execute(runId, operation.id)
  return runId
}

async function execute(runId: string, operationId: string) {
  const db = getDatabase()
  const operation = getOperation(operationId)!
  const ctx: StepContext = { db, runId, state: {} }
  const setStep = db.query(
    'UPDATE run_steps SET status = ?, started_at = COALESCE(started_at, ?), finished_at = ?, items_in = ?, items_out = ?, message = ? WHERE run_id = ? AND position = ?',
  )

  for (const [position, step] of operation.steps.entries()) {
    setStep.run('running', now(), null, null, null, null, runId, position)
    try {
      const result = await step.run(ctx)
      setStep.run(result.skipped ? 'skipped' : 'done', now(), now(), result.itemsIn, result.itemsOut, result.message, runId, position)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setStep.run('failed', now(), now(), null, null, message, runId, position)
      db.query("UPDATE run_steps SET status = 'not run' WHERE run_id = ? AND status = 'pending'").run(runId)
      db.query("UPDATE runs SET status = 'failed', finished_at = ?, error = ? WHERE id = ?").run(now(), `${step.label} failed: ${message}`, runId)
      return
    }
  }
  db.query("UPDATE runs SET status = 'done', finished_at = ? WHERE id = ?").run(now(), runId)
}

export { recoverInterrupted }
