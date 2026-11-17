import type { Database } from 'bun:sqlite'

import { createAdapter } from '../ai/providers'
import { newId, now, sha256 } from '../ids'
import type { Provider } from '#/shared/providers'
import type { Step, StepContext, StepResult } from './types'

// Prepare: one AI call per described startup. It rewrites the registry description as one plain
// English statement of what the startup does, so that descriptions written in three languages and
// three styles (a pitch, a slogan, a product sheet) can be compared with each other.
// The registry description is never replaced: it stays on the startup and stays what the app cites.
// The prepared text is used by Embed only. Without a key, Embed uses the description as published.

/** Changing the instructions invalidates every prepared text. */
const VERSION = 'prepare-1'
/** What a prepared text was made from. A different hash means the text is out of date. */
export const preparedHash = (s: { name: string; sector: string | null; description: string }) => sha256(`${VERSION}\n${s.name}\n${s.sector ?? ''}\n${s.description}`)

const CONCURRENCY = 4
const TIMEOUT_MS = 60_000
const STOP_AFTER_FAILURES = 8

const INSTRUCTIONS = `You prepare startup descriptions from a public registry for a search index.
You receive one startup: its name, its sector and its description, which may be in English, French or Arabic.
Write what the startup does as one or two plain English sentences.
Rules:
- Use only what the description says. Never add a fact, a market, a technology or a number that is not in it.
- Leave out praise and claims that cannot be checked ("leading", "innovative", "revolutionary", "best", "first in Africa").
- Keep every concrete thing: what is built, for whom, how it works, where.
- If the description says too little to tell what the startup does, repeat what it says in English and add nothing.
Answer with one JSON object and nothing else:
{"text": "<the one or two sentences>", "removed": ["<each praise or claim you left out, quoted from the description>"]}`

export type Prepared = { text: string; removed: string[] }
export type Ask = (input: string) => Promise<{ text: string; inputTokens: number | null; outputTokens: number | null }>
type Key = { id: string; provider: Provider; model: string; api_key: string }

/** Reads the model's answer. Anything that is not the agreed object is refused, not repaired. */
export function readAnswer(answer: string, description: string): Prepared {
  const start = answer.indexOf('{')
  const end = answer.lastIndexOf('}')
  if (start < 0 || end <= start) throw new Error('the answer is not a JSON object')
  const parsed = JSON.parse(answer.slice(start, end + 1)) as { text?: unknown; removed?: unknown }
  if (typeof parsed.text !== 'string' || parsed.text.trim().length < 10) throw new Error('the answer has no text')
  const text = parsed.text.replace(/\s+/g, ' ').trim()
  // One or two sentences cannot be much longer than what they summarise.
  if (text.length > Math.max(400, description.length * 2)) throw new Error('the answer is longer than the description allows')
  const removed = Array.isArray(parsed.removed) ? parsed.removed.filter((r): r is string => typeof r === 'string' && r.trim() !== '').map((r) => r.trim()) : []
  return { text, removed }
}

function askWith(key: Key): Ask {
  return async (input) => {
    const { chat, fromSpecTokenUsage } = await import('@tanstack/ai')
    const result = await chat({
      adapter: createAdapter({ provider: key.provider, model: key.model, apiKey: key.api_key }),
      systemPrompts: [INSTRUCTIONS],
      messages: [{ role: 'user', content: input }],
      threadId: newId(),
      stream: false,
      abortController: timeoutController(),
    } as Parameters<typeof chat>[0] & { stream: false })
    const { text, chunks } = result as { text: string; chunks: { usage?: unknown }[] }
    // The finished run carries the token counts, as a total or as one item per model.
    const last = chunks.map((c) => c.usage).filter(Boolean).at(-1)
    const usage = Array.isArray(last) ? fromSpecTokenUsage(last) : (last as { promptTokens?: number; completionTokens?: number } | undefined)
    return { text, inputTokens: usage?.promptTokens ?? null, outputTokens: usage?.completionTokens ?? null }
  }
}

function timeoutController() {
  const controller = new AbortController()
  setTimeout(() => controller.abort(new Error(`no answer within ${TIMEOUT_MS / 1000} seconds`)), TIMEOUT_MS).unref?.()
  return controller
}

/** The step itself, with the AI call passed in so it can be run against a recorded answer. */
export async function prepareWith(db: Database, runId: string, key: { id: string; model: string }, ask: Ask): Promise<StepResult> {
  const startups = db
    .query<{ id: string; name: string; sector: string | null; description: string }, []>(
      'SELECT id, name, sector, description FROM startups WHERE description IS NOT NULL ORDER BY id',
    )
    .all()
    .map((s) => ({ ...s, hash: preparedHash(s) }))
  const have = new Map(db.query<{ startup_id: string; input_hash: string }, []>('SELECT startup_id, input_hash FROM prepared_texts').all().map((p) => [p.startup_id, p.input_hash]))
  const todo = startups.filter((s) => have.get(s.id) !== s.hash)

  const save = db.query(
    `INSERT INTO prepared_texts (startup_id, input_hash, language, text, removed_json, key_id, model, created_at) VALUES (?1, ?2, 'en', ?3, ?4, ?5, ?6, ?7)
     ON CONFLICT(startup_id) DO UPDATE SET input_hash = ?2, language = 'en', text = ?3, removed_json = ?4, key_id = ?5, model = ?6, created_at = ?7`,
  )
  const usage = db.query('INSERT INTO ai_usage (id, key_id, run_id, input_tokens, output_tokens, outcome, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')

  let done = 0
  let failed = 0
  let streak = 0
  let lastError = ''
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, todo.length) }, async () => {
      while (next < todo.length && streak < STOP_AFTER_FAILURES) {
        const s = todo[next++]
        try {
          const answer = await ask(`Name: ${s.name}\nSector: ${s.sector ?? 'not given'}\nDescription: ${s.description}`)
          const prepared = readAnswer(answer.text, s.description)
          save.run(s.id, s.hash, prepared.text, JSON.stringify(prepared.removed), key.id, key.model, now())
          usage.run(newId(), key.id, runId, answer.inputTokens, answer.outputTokens, 'prepared', now())
          done++
          streak = 0
        } catch (error) {
          lastError = error instanceof Error ? error.message : String(error)
          usage.run(newId(), key.id, runId, null, null, `failed: ${lastError}`.slice(0, 200), now())
          failed++
          streak++
        }
      }
    }),
  )
  if (streak >= STOP_AFTER_FAILURES) throw new Error(`Stopped after ${STOP_AFTER_FAILURES} failures in a row (${done} prepared before that). Last error: ${lastError}`)

  // A prepared text whose startup lost its description has nothing to stand on.
  const stale = db.query("DELETE FROM prepared_texts WHERE startup_id NOT IN (SELECT id FROM startups WHERE description IS NOT NULL) RETURNING startup_id").all().length

  return {
    itemsIn: startups.length,
    itemsOut: done,
    message: `${done} descriptions prepared; ${startups.length - todo.length} already up to date${failed ? `; ${failed} failed and will be tried again next run` : ''}`,
    notes: [
      { code: 'prepared', count: done, text: 'descriptions prepared by this run' },
      { code: 'up_to_date', count: startups.length - todo.length, text: 'descriptions that had not changed since they were prepared' },
      { code: 'failed', count: failed, text: `calls that failed; they are tried again on the next run. Last error: ${lastError}` },
      { code: 'removed', count: stale, text: 'prepared texts removed because the startup has no description any more' },
    ].filter((n) => n.count > 0),
  }
}

export const prepare: Step = {
  name: 'prepare',
  label: 'Prepare descriptions with AI',
  run({ db, runId }: StepContext) {
    const key = db.query<Key, []>("SELECT id, provider, model, api_key FROM ai_keys WHERE status = 'active' ORDER BY created_at LIMIT 1").get()
    if (!key) throw new Error('Prepare needs an AI key: add one under Keys. Everything else works without it.')
    return prepareWith(db, runId, key, askWith(key))
  },
}
