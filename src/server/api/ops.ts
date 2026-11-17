import { createServerFn } from '@tanstack/react-start'

import { getDatabase } from '../db'
import { entryView, findEntries, pipelineState } from '../pipeline/state'

// The operator's questions, answered from the data: is each step up to date, and how was this entry read.
// The logic lives in pipeline/state.ts so it can be tested without a server.

/** Each step of the pipeline: what it covers, what is out of date or missing and why, and what to run next. */
export const getPipelineState = createServerFn().handler(async () => pipelineState(getDatabase()))

/** Entries by the start of their id, by words in the published row, or by the startup's website. */
export const searchEntries = createServerFn()
  .validator((q: string) => q)
  .handler(async ({ data }) => findEntries(getDatabase(), data))

/** One entry: the published row, how it was read, the startup it became, why, and what the later steps hold. */
export const getEntry = createServerFn()
  .validator((id: string) => id)
  .handler(async ({ data }) => entryView(getDatabase(), data))
