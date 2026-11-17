import { createServerFn } from '@tanstack/react-start'

import { getDatabase } from '../db'
import { newId, now } from '../ids'

/*
 * Idea check on shared words: FTS5 over each startup's name, description and sector.
 * Matching by meaning replaces this once the archive is indexed; the report says which one ran.
 * Checks live in memory until the idea-check table lands; a restart forgets them.
 */

const STOP = new Set(
  'the and for with that this from into their your our are was were has have its they them which who what when where will can also more most such than then using use used based platform solution solutions company startup startups app application tunisia tunisian service services offers offer provides provide allows help helps new des les une pour avec dans sur par qui est sont aux leur plus que pas around directly small large big like just other very each every people users user want wants need needs make makes easy easily simple local online digital smart best good better great without within between across through about over under after before while where them those these there here only also very much many some most such into onto tous tout toutes faire aussi entre plus moins comme très'.split(' '),
)

export const ideaWords = (text: string) => [
  ...new Set(
    text
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((w) => w.length > 3 && !STOP.has(w)),
  ),
].slice(0, 12)

export type IdeaMatch = { id: string; name: string; sector: string | null; cohort: string | null; creation_year: number | null; description: string | null; website: string | null; shared: string[]; missing: string[]; score: number }
export type IdeaCheck = {
  id: string
  idea: string
  checkedAt: string
  snapshotAt: string | null
  against: number
  words: string[]
  /** Startups sharing enough of the idea's words to count: at least two, or 40% of them. */
  strong: number
  /** Startups sharing at least one word. */
  any: number
  matches: IdeaMatch[]
  weak: IdeaMatch[]
  weakTotal: number
  /** The sector most of the close matches share, counted across the whole registry. */
  sector: { name: string; total: number; recent: number; since: number } | null
  saved: boolean
}

const checks: IdeaCheck[] = []
const fts = (w: string) => `"${w.replace(/"/g, '')}"*`

function run(idea: string, saved = false): IdeaCheck {
  const db = getDatabase()
  const words = ideaWords(idea)
  const against = db.query<{ n: number }, []>('SELECT COUNT(*) AS n FROM startups').get()?.n ?? 0
  const snapshotAt = db.query<{ at: string }, []>('SELECT fetched_at AS at FROM downloads ORDER BY id DESC LIMIT 1').get()?.at ?? null
  // Rare words carry more: "saffron" says more about an idea than "market".
  const count = db.query<{ n: number }, [string]>('SELECT COUNT(*) AS n FROM startups_fts WHERE startups_fts MATCH ?')
  const weight = new Map(words.map((w) => [w, Math.log((against + 1) / ((count.get(fts(w))?.n ?? 0) + 1))]))
  const any = words.length ? (count.get(words.map(fts).join(' OR '))?.n ?? 0) : 0
  const hits = words.length
    ? db
        .query<Omit<IdeaMatch, 'shared' | 'missing' | 'score'>, [string]>(
          `SELECT s.id, s.name, s.sector, s.cohort, s.creation_year, s.description, s.website FROM startups_fts f
           JOIN startups s ON s.id = f.startup_id WHERE startups_fts MATCH ? ORDER BY rank LIMIT 400`,
        )
        .all(words.map(fts).join(' OR '))
    : []
  const scored = hits
    .map((h) => {
      const hay = `${h.name} ${h.description ?? ''} ${h.sector ?? ''}`.toLowerCase()
      const shared = words.filter((w) => hay.includes(w))
      return { ...h, shared, missing: words.filter((w) => !shared.includes(w)), score: shared.reduce((t, w) => t + (weight.get(w) ?? 0), 0) }
    })
    .filter((m) => m.shared.length > 0)
    .sort((x, y) => y.score - x.score || x.name.localeCompare(y.name))
  const isStrong = (m: IdeaMatch) => m.shared.length >= 2 || m.shared.length / Math.max(1, words.length) >= 0.4
  const strong = scored.filter(isStrong)
  // Real registry fields only: the sector most close matches share, and how many joined it lately.
  const bySector = new Map<string, number>()
  for (const m of strong.slice(0, 8)) if (m.sector) bySector.set(m.sector, (bySector.get(m.sector) ?? 0) + 1)
  const top = [...bySector.entries()].sort((p, q) => q[1] - p[1])[0]?.[0]
  const since = 2023
  const sector = top
    ? {
        name: top,
        since,
        total: db.query<{ n: number }, [string]>('SELECT COUNT(*) AS n FROM startups WHERE sector = ?').get(top)?.n ?? 0,
        recent: db.query<{ n: number }, [string, number]>('SELECT COUNT(*) AS n FROM startups WHERE sector = ? AND CAST(substr(cohort, 4, 4) AS INTEGER) >= ?').get(top, since)?.n ?? 0,
      }
    : null
  return { id: newId(), idea, checkedAt: now(), snapshotAt, against, words, strong: strong.length, any, matches: strong.slice(0, 8), weak: scored.filter((m) => !isStrong(m)).slice(0, 12), weakTotal: scored.filter((m) => !isStrong(m)).length, sector, saved }
}

function seed() {
  if (checks.length) return
  checks.push(run('A marketplace where olive farmers sell directly to restaurants and shops', true))
  checks.push(run('Insurance for small fishing boats, paid by the trip', true))
}

export const listIdeaChecks = createServerFn().handler(async () => {
  seed()
  return checks.filter((c) => c.saved).map(({ id, idea, checkedAt, strong }) => ({ id, idea, checkedAt, matches: strong }))
})

export const getIdeaCheck = createServerFn()
  .validator((id: string) => id)
  .handler(async ({ data }) => {
    seed()
    return checks.find((c) => c.id === data) ?? null
  })

export const runIdeaCheck = createServerFn({ method: 'POST' })
  .validator((idea: string) => {
    const text = idea.trim()
    if (text.length < 12) throw new Error('Describe the idea in a full sentence: who it serves and what it does.')
    return text.slice(0, 600)
  })
  .handler(async ({ data }) => {
    seed()
    const check = run(data)
    checks.unshift(check)
    return { id: check.id }
  })

export const saveIdeaCheck = createServerFn({ method: 'POST' })
  .validator((input: { id: string; saved: boolean }) => input)
  .handler(async ({ data }) => {
    const c = checks.find((x) => x.id === data.id)
    if (c) c.saved = data.saved
  })
