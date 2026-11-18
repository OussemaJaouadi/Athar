import { createServerFn } from '@tanstack/react-start'

import { askModel } from '../ai/ask'
import { getDatabase } from '../db'
import { newId, now, sha256 } from '../ids'
import { detectLanguage } from '../pipeline/clean'
import { embedQuery } from '../pipeline/embedder'
import { similarTo } from '../pipeline/similar'
import type { Provider } from '#/shared/providers'
import type { WebsiteCheck } from '#/shared/website'

// The idea page: a typed idea placed among the startups of the registry, by meaning.
// It works with no AI key. With one, the model adds two sentences per match: what is the same, what is different.

/**
 * Measured on the registry with a handful of ideas, so treat these as a first calibration, not a law.
 * Against a typed idea, the startup that describes it best scores about 0.6; an unrelated idea still scores
 * about 0.5 against its nearest startup. Rewording an idea moves every score together by a few hundredths,
 * so "close" is measured from the best match down, not as one fixed line.
 */
const BEST_AT_LEAST = 0.555 // below this, even the best match is not about the idea
const WITHIN = 0.095 // close = this near the best match
const FLOOR = 0.52 // and never below this
const FAR = 0.5
const FAR_MAX = 8
const NEAREST = 3

export type Band = 'close' | 'far' | 'nearest'
type StoredMatch = { startupId: string; closeness: number; band: Band }
export type Explanation = { startupId: string; same: string; different: string }
export type IdeaMatch = {
  id: string; name: string; sector: string | null; labelled: string | null; description: string | null
  closeness: number; band: Band; check: WebsiteCheck | null
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

export const checkIdea = createServerFn({ method: 'POST' })
  .validator((idea: string) => {
    const text = idea.replace(/\s+/g, ' ').trim()
    if (text.length < 12) throw new Error('Describe the idea in a full sentence: who it serves and what it does.')
    return text.slice(0, 600)
  })
  .handler(async ({ data: idea }) => {
    const db = getDatabase()
    const compared = db.query<{ n: number }, []>('SELECT COUNT(*) AS n FROM embedding_meta').get()?.n ?? 0
    if (!compared) throw new Error('The registry is not embedded yet: run Embed in the portal first.')
    const found = await similarTo(db, idea, 40)
    const best = found[0]?.similarity ?? 0
    const line = best >= BEST_AT_LEAST ? Math.max(FLOOR, best - WITHIN) : Number.POSITIVE_INFINITY
    const close = found.filter((m) => m.similarity >= line)
    const far = found.filter((m) => m.similarity < line && m.similarity >= FAR).slice(0, FAR_MAX)
    const matches: StoredMatch[] = [
      ...close.map((m) => ({ startupId: m.startupId, closeness: m.similarity, band: 'close' as const })),
      ...far.map((m) => ({ startupId: m.startupId, closeness: m.similarity, band: 'far' as const })),
      // Nothing even shares its words: show the nearest few, named as not close.
      ...(close.length + far.length ? [] : found.slice(0, NEAREST).map((m) => ({ startupId: m.startupId, closeness: m.similarity, band: 'nearest' as const }))),
    ]
    const at = now()
    const id = sha256(`${idea}\n${at}`).slice(0, 10)
    const download = db.query<{ id: number }, []>('SELECT MAX(id) AS id FROM downloads').get()?.id ?? null
    db.query('INSERT INTO idea_checks (id, idea, language, checked_at, download, compared, matches_json) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
      id, idea, detectLanguage(idea), at, download, compared, JSON.stringify(matches),
    )
    return { id }
  })

/** Loads the embedding model before the first idea is typed; a cold start takes up to a minute. */
export const warmIdeaModel = createServerFn({ method: 'POST' }).handler(async () => {
  void embedQuery('warm').catch(() => undefined)
  return { ok: true }
})

type CheckRow = {
  id: string; idea: string; language: string | null; checked_at: string; compared: number; matches_json: string
  explained_json: string | null; explained_model: string | null; saved: number
}

export const getIdea = createServerFn()
  .validator((id: string) => id)
  .handler(async ({ data: id }) => {
    const db = getDatabase()
    const c = db.query<CheckRow, [string]>('SELECT * FROM idea_checks WHERE id = ?').get(id)
    if (!c) return null
    const row = db.query<
      { id: string; name: string; sector: string | null; labelled: string | null; description: string | null
        status: 'reachable' | 'unreachable' | null; detail: string | null; final_host: string | null; checked_at: string | null; since: string | null },
      [string]
    >(
      `SELECT s.id, COALESCE(s.display_name, s.name) AS name, s.sector, s.labelled, s.description, w.status, w.detail, w.final_host, w.checked_at, w.since
       FROM startups s LEFT JOIN website_checks w ON w.startup_id = s.id WHERE s.id = ?`,
    )
    const matches: IdeaMatch[] = (JSON.parse(c.matches_json) as StoredMatch[]).flatMap((m) => {
      const s = row.get(m.startupId)
      if (!s) return [] // the startup has since left the data
      return [{
        id: s.id, name: s.name, sector: s.sector, labelled: s.labelled, description: s.description, closeness: m.closeness, band: m.band,
        check: s.status ? { status: s.status, detail: s.detail!, finalHost: s.final_host, checkedAt: s.checked_at!, since: s.since! } : null,
      }]
    })
    const total = db.query<{ n: number }, []>('SELECT COUNT(*) AS n FROM startups').get()?.n ?? 0
    const lastYear = db.query<{ y: string | null }, []>('SELECT MAX(substr(labelled, 1, 4)) AS y FROM startups').get()?.y ?? null
    const years = db.query<{ year: string }, []>("SELECT DISTINCT substr(labelled, 1, 4) AS year FROM startups WHERE labelled IS NOT NULL ORDER BY 1").all().map((y) => y.year)
    const hasKey = !!db.query<{ id: string }, []>("SELECT id FROM ai_keys WHERE status = 'active' LIMIT 1").get()
    return {
      id: c.id, idea: c.idea, language: c.language, checkedAt: c.checked_at, compared: c.compared, undescribed: Math.max(0, total - c.compared),
      matches, years, lastYear, saved: c.saved === 1,
      explanations: c.explained_json ? (JSON.parse(c.explained_json) as Explanation[]) : null,
      explainedBy: c.explained_model,
      /** An AI key is saved and there is something to explain. */
      canExplain: hasKey && matches.some((m) => m.band === 'close'),
    }
  })

export type IdeaPage = NonNullable<Awaited<ReturnType<typeof getIdea>>>

const INSTRUCTIONS = `You compare a startup idea with descriptions of existing startups from a public registry.
For each startup, write two short sentences:
- "same": what the startup's description and the idea have in common.
- "different": what the idea asks for that the description does not say, or what the startup does instead.
Rules:
- Use only the idea and that startup's description. Never add a fact about the startup that its description does not state.
- At most 25 words per sentence. Plain words, no praise, no advice.
- If the description covers the whole idea, "different" is "Nothing in its description." in the language of the idea.
- Write in the language of the idea.
Answer with one JSON array and nothing else: [{"id": "<startup id>", "same": "...", "different": "..."}]`

/** Reads the model's answer; anything that is not the agreed list, or names a startup that was not sent, is refused. */
export function readExplanations(answer: string, ids: string[]): Explanation[] {
  const start = answer.indexOf('[')
  const end = answer.lastIndexOf(']')
  if (start < 0 || end <= start) throw new Error('the answer is not a JSON list')
  const parsed = JSON.parse(answer.slice(start, end + 1)) as { id?: unknown; same?: unknown; different?: unknown }[]
  const out: Explanation[] = []
  for (const p of parsed) {
    if (typeof p.id !== 'string' || !ids.includes(p.id) || typeof p.same !== 'string' || typeof p.different !== 'string') continue
    if (!p.same.trim() || !p.different.trim()) continue
    out.push({ startupId: p.id, same: clip(p.same.replace(/\s+/g, ' ').trim(), 240), different: clip(p.different.replace(/\s+/g, ' ').trim(), 240) })
  }
  if (!out.length) throw new Error('the answer explains none of the matches')
  return out
}

/** Asks the operator's model once for the close matches of a check, and keeps the answer with the check. */
export const explainIdea = createServerFn({ method: 'POST' })
  .validator((id: string) => id)
  .handler(async ({ data: id }): Promise<{ explanations: Explanation[]; model: string } | { error: string }> => {
    const db = getDatabase()
    const c = db.query<CheckRow, [string]>('SELECT * FROM idea_checks WHERE id = ?').get(id)
    if (!c) return { error: 'This idea check no longer exists.' }
    if (c.explained_json && c.explained_model) return { explanations: JSON.parse(c.explained_json) as Explanation[], model: c.explained_model }
    const key = db.query<{ id: string; provider: Provider; model: string; api_key: string }, []>("SELECT id, provider, model, api_key FROM ai_keys WHERE status = 'active' ORDER BY created_at LIMIT 1").get()
    if (!key) return { error: 'No AI key is saved.' }
    const close = (JSON.parse(c.matches_json) as StoredMatch[]).filter((m) => m.band === 'close').slice(0, 12)
    const described = close.flatMap((m) => {
      const s = db.query<{ id: string; description: string | null }, [string]>('SELECT id, description FROM startups WHERE id = ?').get(m.startupId)
      return s?.description ? [{ id: s.id, description: s.description }] : []
    })
    if (!described.length) return { error: 'There is no close match to explain.' }
    const usage = db.query('INSERT INTO ai_usage (id, key_id, run_id, input_tokens, output_tokens, outcome, created_at) VALUES (?, ?, NULL, ?, ?, ?, ?)')
    try {
      const answer = await askModel(
        { provider: key.provider, model: key.model, apiKey: key.api_key },
        INSTRUCTIONS,
        `Idea: ${c.idea}\n\nStartups:\n${described.map((d) => `- id: ${d.id}\n  description: ${d.description}`).join('\n')}`,
      )
      const explanations = readExplanations(answer.text, described.map((d) => d.id))
      db.query('UPDATE idea_checks SET explained_json = ?, explained_model = ? WHERE id = ?').run(JSON.stringify(explanations), key.model, id)
      usage.run(newId(), key.id, answer.inputTokens, answer.outputTokens, 'idea explained', now())
      return { explanations, model: key.model }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      usage.run(newId(), key.id, null, null, `failed: ${message}`.slice(0, 200), now())
      return { error: `The AI model did not explain the matches: ${message}` }
    }
  })

export const saveIdea = createServerFn({ method: 'POST' })
  .validator((input: { id: string; saved: boolean }) => input)
  .handler(async ({ data }) => {
    getDatabase().query('UPDATE idea_checks SET saved = ? WHERE id = ?').run(data.saved ? 1 : 0, data.id)
  })

export const listIdeas = createServerFn().handler(async () =>
  getDatabase()
    .query<{ id: string; idea: string; checked_at: string; matches_json: string }, []>('SELECT id, idea, checked_at, matches_json FROM idea_checks WHERE saved = 1 ORDER BY checked_at DESC')
    .all()
    .map((c) => ({ id: c.id, idea: c.idea, checkedAt: c.checked_at, close: (JSON.parse(c.matches_json) as StoredMatch[]).filter((m) => m.band === 'close').length })),
)
