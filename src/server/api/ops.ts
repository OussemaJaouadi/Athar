import { createServerFn } from '@tanstack/react-start'

import { getDatabase } from '../db'
import { entryView, findEntries, leadEntry, pipelineState } from '../pipeline/state'

// The operator's questions, answered from the data: is each step up to date, and how was this entry read.
// The logic lives in pipeline/state.ts so it can be tested without a server.

/** Each step of the pipeline: what it covers, what is out of date or missing and why, and what to run next. */
export const getPipelineState = createServerFn().handler(async () => pipelineState(getDatabase()))

/** Entries by the start of their id, by words in the published row, or by the startup's website. */
export const searchEntries = createServerFn()
  .validator((q: string) => q)
  .handler(async ({ data }) => findEntries(getDatabase(), data))

/** The id of the entry a startup's values were read from, for every "open its entry" link; null for an unknown startup. */
export const getLeadEntry = createServerFn()
  .validator((startupId: string) => startupId)
  .handler(async ({ data }) => leadEntry(getDatabase(), data))

/** One entry: the published row, how it was read, the startup it became, why, and what the later steps hold. */
export const getEntry = createServerFn()
  .validator((id: string) => id)
  .handler(async ({ data }) => entryView(getDatabase(), data))

// ── The rows behind the numbers ─────────────────────────────────────────────────────────────────

import { askModel } from '../ai/ask'
import { downloadChanges, downloads, factRows, foundersOf, ideaCheck, ideaChecks, people, person, qualitySummary, searchStartups } from '../pipeline/facts'
import type { Provider } from '#/shared/providers'

/** The startups or entries a counted fact stands for, by the note's code. Null when the code has no rows behind it. */
export const getFactRows = createServerFn()
  .validator((code: string) => code)
  .handler(async ({ data }) => factRows(getDatabase(), data))

/** Every download, newest first, with what it added and what it no longer published. */
export const listDownloads = createServerFn().handler(async () => downloads(getDatabase()))

/** What one download changed against the one before it, entry by entry. */
export const getDownloadChanges = createServerFn()
  .validator((id: number) => id)
  .handler(async ({ data }) => downloadChanges(getDatabase(), data))

/** People named as founders, grouped by person, searchable by any spelling. */
export const listPeople = createServerFn()
  .validator((options: { q?: string; repeat?: boolean; limit?: number; offset?: number }) => options)
  .handler(async ({ data }) => people(getDatabase(), data))

/** Stored idea checks, newest first. */
export const listIdeaChecks = createServerFn()
  .validator((options: { savedOnly?: boolean; limit?: number }) => options)
  .handler(async ({ data }) => ideaChecks(getDatabase(), data))

export type KeyProbe = { ok: true; reply: string; milliseconds: number; inputTokens: number | null; outputTokens: number | null } | { ok: false; error: string; milliseconds: number }

/**
 * Sends one real one-line prompt with a saved key. The save-time test only asks the provider whether it lists the model;
 * this says whether the model answers. It never blocks saving a key, and the call is recorded in ai_usage.
 */
export const probeKey = createServerFn({ method: 'POST' })
  .validator((id: string) => id)
  .handler(async ({ data: id }): Promise<KeyProbe> => {
    const db = getDatabase()
    const key = db.query<{ id: string; provider: Provider; model: string; api_key: string }, [string]>('SELECT id, provider, model, api_key FROM ai_keys WHERE id = ?').get(id)
    const started = Date.now()
    if (!key) return { ok: false, error: 'This key no longer exists.', milliseconds: 0 }
    const usage = db.query('INSERT INTO ai_usage (id, key_id, run_id, input_tokens, output_tokens, outcome, created_at) VALUES (?, ?, NULL, ?, ?, ?, ?)')
    const at = () => new Date().toISOString()
    try {
      const answer = await askModel({ provider: key.provider, model: key.model, apiKey: key.api_key }, 'Answer in one short line.', 'Say that you are ready, in five words or fewer.')
      const reply = answer.text.replace(/\s+/g, ' ').trim()
      if (!reply) throw new Error('the model returned an empty answer')
      usage.run(Bun.randomUUIDv7(), key.id, answer.inputTokens, answer.outputTokens, 'key probed', at())
      return { ok: true, reply: reply.slice(0, 200), milliseconds: Date.now() - started, inputTokens: answer.inputTokens, outputTokens: answer.outputTokens }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      usage.run(Bun.randomUUIDv7(), key.id, null, null, `failed: ${message}`.slice(0, 200), at())
      return { ok: false, error: message, milliseconds: Date.now() - started }
    }
  })

/** The founders of one startup, in published order, each with the slug of the person and how many startups name them. */
export const getFoundersOf = createServerFn()
  .validator((startupId: string) => startupId)
  .handler(async ({ data }) => foundersOf(getDatabase(), data))

/** One person by slug, whatever page of the people list they are on. */
export const getPersonRow = createServerFn()
  .validator((slug: string) => slug)
  .handler(async ({ data }) => person(getDatabase(), data))

/** One stored idea check by id, however old. */
export const getIdeaCheckRow = createServerFn()
  .validator((id: string) => id)
  .handler(async ({ data }) => ideaCheck(getDatabase(), data))

/** Every doubtful or missing thing, counted on today's data; each code opens with getFactRows. */
export const getQualitySummary = createServerFn().handler(async () => qualitySummary(getDatabase()))

/** Startups by name, exact slug, website or the start of an entry id, for the operator's Startups page. */
export const searchStartupsOps = createServerFn()
  .validator((q: string) => q)
  .handler(async ({ data }) => searchStartups(getDatabase(), data))
