import type { Database } from 'bun:sqlite'

// Shared contract: every pipeline step reports what went in, what came out, and why.
export type StepContext = {
  db: Database
  runId: string
}

/** A counted fact about the data. It informs; it never waits for a decision. */
export type RunNote = { code: string; count: number; text: string }

export type StepResult = {
  itemsIn: number
  itemsOut: number
  message: string
  notes?: RunNote[]
  skipped?: boolean
}

export type Step = {
  name: string
  label: string
  run(ctx: StepContext): Promise<StepResult> | StepResult
}

export type Operation = {
  id: string
  label: string
  description: string
  steps: Step[]
}
