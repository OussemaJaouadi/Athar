import type { Database } from 'bun:sqlite'

// Shared contract: every pipeline step reports what went in, what came out, and why.
export type StepContext = {
  db: Database
  runId: string
  /** Values a step hands to the next one, such as the snapshot id. */
  state: Record<string, string | undefined>
}

export type StepResult = {
  itemsIn: number
  itemsOut: number
  message: string
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
