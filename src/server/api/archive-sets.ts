import type { Database } from 'bun:sqlite'

import { effective } from '../pipeline/review'
import { startupStory } from '../pipeline/story'

// What the Archive filters on besides the registry's own columns: values the pipeline derived, with the
// owner's decisions applied. The rules live in pipeline/story.ts; this only collects the startup ids.

/** `yes`/`no`: a website is listed or not. The rest: what our last check of the listed website found. */
export const WEBSITE_FILTERS = ['yes', 'no', 'answers', 'moved', 'parked', 'silent'] as const
export type WebsiteFilter = (typeof WEBSITE_FILTERS)[number]
export const VENTURE_FILTERS = ['founders', 'names'] as const
export type VentureFilter = (typeof VENTURE_FILTERS)[number]

export const parseWebsite = (v: unknown): WebsiteFilter | undefined => WEBSITE_FILTERS.find((x) => x === v)
export const parseVentures = (v: unknown): VentureFilter | undefined => VENTURE_FILTERS.find((x) => x === v)

const tokens = (s: string) => s.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean)

/** True when every word typed starts a word of one of the names (the same prefix rule as the archive's search). */
export function namesMatch(names: string[], q: string): boolean {
  const words = tokens(q)
  if (!words.length) return false
  return names.some((n) => {
    const t = tokens(n)
    return words.every((w) => t.some((x) => x.startsWith(w)))
  })
}

export type DerivedSets = {
  /** Effective website state per startup, as in pipeline/story: a decision beats the check. */
  site: Map<string, string>
  /** Startups whose founders have another venture: renamed, successor or sibling, not a bare shared name. */
  founders: Set<string>
  /** Other names per startup. */
  names: Map<string, string[]>
}

let memo: { key: string; sets: DerivedSets } | null = null

export function derivedSets(db: Database): DerivedSets {
  const key = JSON.stringify(
    db
      .query<unknown, []>(
        `SELECT (SELECT COUNT(*) FROM readings) AS r, (SELECT COALESCE(SUM(length(value) + length(why)), 0) FROM readings) AS rl,
                (SELECT COUNT(*) FROM decisions) AS d, (SELECT COALESCE(MAX(decided_at), '') FROM decisions) AS dm,
                (SELECT COUNT(*) FROM website_checks) AS w, (SELECT COALESCE(MAX(checked_at), '') FROM website_checks) AS wm`,
      )
      .get(),
  )
  if (memo?.key === key) return memo.sets

  const site = new Map<string, string>()
  for (const c of db.query<{ startup_id: string; state: string | null; status: string }, []>('SELECT startup_id, state, status FROM website_checks').all()) {
    site.set(c.startup_id, c.state ?? (c.status === 'reachable' ? 'answers' : 'silent'))
  }
  const founders = new Set<string>()
  const names = new Map<string, string[]>()
  const subjects = new Set<string>()
  for (const e of effective(db)) {
    if (e.kind === 'relation') for (const id of e.subject.split('|')) subjects.add(id)
    if (e.kind === 'alias') subjects.add(e.subject)
    if (e.kind === 'website' && e.decided) {
      const state = (e.decided.value as { state?: unknown } | null)?.state
      if (typeof state === 'string') site.set(e.subject, state)
    }
  }
  for (const id of subjects) {
    const story = startupStory(db, id)
    if (!story) continue
    if (story.ventures.some((v) => !v.nameOnly && v.relation !== 'unrelated')) founders.add(id)
    if (story.otherNames.length) names.set(id, story.otherNames.map((n) => n.name))
  }
  const sets = { site, founders, names }
  memo = { key, sets }
  return sets
}
