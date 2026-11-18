import type { Database } from 'bun:sqlite'

import { now } from '../ids'
import { applyDecisions, decide, type Effective, laneTotals, lanePercent, type LaneTotals, staleDecisions } from './decisions'
import { type Decision, readingId, type ReadingKind, type StoredReading } from './readings'
import { answerLabel } from './review-context'

// The operator's review of derived readings: load them, apply the decisions, list what waits, record an answer.
// Storage lives in migration 009 (tables `readings` and `decisions`); the rules live in decisions.ts.

type ReadingRow = { id: string; kind: ReadingKind; subject: string; value: string; lane: StoredReading['lane']; rule: string; why: string; basis: string }
type DecisionRow = { reading_id: string; basis: string; value: string; note: string | null; decided_at: string }

/** People first: whether two startups are related often depends on whether a shared name is one person. */
export const REVIEW_ORDER: ReadingKind[] = ['person', 'person_pair', 'relation', 'website', 'founder', 'alias', 'name']

/** Relation rules that rest on one shared founder name; only these follow a person reading. */
const FOLLOWED_RULES = ['relation.one-founder-only', 'relation.one-founder-same-field']

/**
 * A relation that waits on a person reading: the shared name is one person, so the relation question depends on it.
 * waiting: the person question is still open; different: the person is not the same, so the startups are not related;
 * same: the person is the same, so the relation question stays in the queue.
 */
export type Follow = { personId: string; key: string; state: 'waiting' | 'different' | 'same' }

export type ReviewItem = {
  id: string
  kind: ReadingKind
  subject: string
  /** The value Athar read. */
  value: unknown
  rule: string
  why: string
  lane: 'rule' | 'inferred' | 'review'
  /** The operator's answer that applies now, or null. */
  /** `label` is the words of the answer the value matches, or null when no answer offers it. */
  decided: { value: unknown; note: string | null; decidedAt: string; label?: string | null } | null
  /** Set on relations that follow a person reading. */
  follows?: Follow | null
  /** The subject in the registry's words: startup and founder names in place of ids and keys. */
  label?: string
}

export type ReviewSummary = {
  totals: LaneTotals
  percent: { settled: number; inferred: number; waiting: number }
  byKind: { kind: ReadingKind; open: number; decided: number }[]
  /** Decisions that no longer apply (reading gone or basis changed). */
  stale: number
  /** The length of the open queue: open readings minus relations that follow a person still waiting or different. */
  toAnswer: number
  /** Relations waiting for their person reading to be answered. */
  waitingOnPerson: number
  /** Relations whose shared name is a different person, so they are not asked. */
  followed: number
}

export function loadReadings(db: Database): StoredReading[] {
  return db
    .query<ReadingRow, []>('SELECT id, kind, subject, value, lane, rule, why, basis FROM readings ORDER BY id')
    .all()
    .map((row) => ({ ...row, value: JSON.parse(row.value) as unknown }))
}

export function loadDecisions(db: Database): Decision[] {
  return db
    .query<DecisionRow, []>('SELECT reading_id, basis, value, note, decided_at FROM decisions ORDER BY decided_at')
    .all()
    .map((row) => ({ readingId: row.reading_id, basis: row.basis, value: JSON.parse(row.value) as unknown, note: row.note, decidedAt: row.decided_at }))
}

export function effective(db: Database): Effective[] {
  return applyDecisions(loadReadings(db), loadDecisions(db))
}

/** The person keys that appear among the founders of both startups; distinct, sorted, empty keys ignored. */
export function sharedPersonKeys(db: Database, a: string, b: string): string[] {
  return db
    .query<{ key: string }, [string, string]>(
      `SELECT DISTINCT fa.person_key AS key FROM founders fa
       JOIN founders fb ON fb.person_key = fa.person_key
       WHERE fa.startup_id = ? AND fb.startup_id = ? AND fa.person_key <> ''
       ORDER BY key`,
    )
    .all(a, b)
    .map((row) => row.key)
}

/** The `same` answer of a person reading's value, or undefined when the value has none. */
function sameOf(value: unknown): boolean | undefined {
  if (typeof value !== 'object' || value === null || !('same' in value)) return undefined
  const same = (value as { same: unknown }).same
  return typeof same === 'boolean' ? same : undefined
}

function followIn(db: Database, relation: Effective, byId: Map<string, Effective>): Follow | null {
  if (relation.kind !== 'relation' || !FOLLOWED_RULES.includes(relation.rule) || relation.decided !== null) return null
  const [a, b] = relation.subject.split('|')
  if (a === undefined || b === undefined) return null
  const keys = sharedPersonKeys(db, a, b)
  if (keys.length !== 1) return null
  const key = keys[0]
  const personId = readingId('person', key)
  const person = byId.get(personId)
  if (!person) return null
  if (person.open) return { personId, key, state: 'waiting' }
  return { personId, key, state: sameOf(person.effectiveValue) === false ? 'different' : 'same' }
}

/** The follow state of each relation that has one, keyed by reading id. */
function followsOf(db: Database, readings: Effective[]): Map<string, Follow> {
  const byId = new Map(readings.map((e) => [e.id, e]))
  const follows = new Map<string, Follow>()
  for (const e of readings) {
    const follow = followIn(db, e, byId)
    if (follow) follows.set(e.id, follow)
  }
  return follows
}

/** Whether a reading is left out of the open queue because it follows a person still waiting or different. */
const leftOut = (e: Effective, follows: Map<string, Follow>) => e.open && (follows.get(e.id)?.state ?? 'same') !== 'same'

export function followOf(db: Database, relation: Effective, all: Effective[]): Follow | null {
  return followIn(db, relation, new Map(all.map((e) => [e.id, e])))
}

const rank = (kind: ReadingKind) => REVIEW_ORDER.indexOf(kind)

function toItem(e: Effective, follow: Follow | null | undefined): ReviewItem {
  const item: ReviewItem = {
    id: e.id,
    kind: e.kind,
    subject: e.subject,
    value: e.value,
    rule: e.rule,
    why: e.why,
    lane: e.lane,
    decided: e.decided ? { value: e.decided.value, note: e.decided.note, decidedAt: e.decided.decidedAt, label: answerLabel(e.kind, e.decided.value) } : null,
  }
  if (follow) item.follows = follow
  return item
}

/** Names for a queue row: a startup by its display name, a person by a published spelling. */
function labeller(db: Database): (item: ReviewItem) => ReviewItem {
  const startups = new Map(db.query<{ id: string; name: string }, []>('SELECT id, COALESCE(display_name, name) AS name FROM startups').all().map((r) => [r.id, r.name]))
  const people = new Map(db.query<{ key: string; name: string }, []>('SELECT person_key AS key, MIN(COALESCE(display_name, name)) AS name FROM founders GROUP BY person_key').all().map((r) => [r.key, r.name]))
  const startup = (id: string) => startups.get(id) ?? id
  const person = (key: string) => people.get(key) ?? key
  return (item) => {
    const s = item.subject
    const label =
      item.kind === 'person' ? person(s)
      : item.kind === 'person_pair' ? s.split('|').map(person).join(' · ')
      : item.kind === 'relation' ? s.split('|').map(startup).join(' · ')
      : item.kind === 'founder' ? startup(s.slice(0, s.lastIndexOf('#') < 0 ? undefined : s.lastIndexOf('#')))
      : startup(s)
    return { ...item, label }
  }
}

export function reviewQueue(
  db: Database,
  options: { kind?: ReadingKind; include?: 'open' | 'decided' | 'all' | 'following' } = {},
): ReviewItem[] {
  const include = options.include ?? 'open'
  const readings = effective(db)
  const follows = followsOf(db, readings)
  return readings
    .filter((e) => {
      if (options.kind !== undefined && e.kind !== options.kind) return false
      if (include === 'open') return e.open && !leftOut(e, follows)
      if (include === 'decided') return e.decided !== null
      if (include === 'following') return leftOut(e, follows)
      return e.open || e.decided !== null
    })
    .sort((a, b) => {
      const byKind = rank(a.kind) - rank(b.kind)
      if (byKind !== 0) return byKind
      if (a.subject !== b.subject) return a.subject < b.subject ? -1 : 1
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
    })
    .map((e) => toItem(e, follows.get(e.id)))
    .map(labeller(db))
}

export function reviewSummary(db: Database): ReviewSummary {
  const readings = effective(db)
  const totals = laneTotals(readings)
  const follows = followsOf(db, readings)
  const byKind = REVIEW_ORDER.map((kind) => {
    const of = readings.filter((e) => e.kind === kind)
    return { kind, open: of.filter((e) => e.open && !leftOut(e, follows)).length, decided: of.filter((e) => e.decided !== null).length }
  }).filter((k) => k.open > 0 || k.decided > 0)
  const stale = staleDecisions(loadReadings(db), loadDecisions(db)).length
  const states = [...follows.values()].map((f) => f.state)
  return {
    totals,
    percent: lanePercent(totals),
    byKind,
    stale,
    toAnswer: readings.filter((e) => e.open && !leftOut(e, follows)).length,
    waitingOnPerson: states.filter((s) => s === 'waiting').length,
    followed: states.filter((s) => s === 'different').length,
  }
}

export function decideReading(db: Database, input: { id: string; value: unknown; note?: string | null }): ReviewItem {
  const reading = loadReadings(db).find((r) => r.id === input.id)
  if (!reading) throw new Error('No reading with this id')
  const decision = decide(reading, input.value, input.note ?? null, now())
  db.run(
    `INSERT INTO decisions (reading_id, basis, value, note, decided_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(reading_id) DO UPDATE SET basis = excluded.basis, value = excluded.value, note = excluded.note, decided_at = excluded.decided_at`,
    [decision.readingId, decision.basis, JSON.stringify(decision.value), decision.note, decision.decidedAt],
  )
  return toItem({ ...reading, decided: decision, open: false, effectiveValue: decision.value }, undefined)
}

export function undoDecision(db: Database, id: string): boolean {
  return db.query('DELETE FROM decisions WHERE reading_id = ?').run(id).changes > 0
}

export function forgetStale(db: Database): number {
  const stale = staleDecisions(loadReadings(db), loadDecisions(db))
  const remove = db.query('DELETE FROM decisions WHERE reading_id = ?')
  db.transaction(() => {
    for (const d of stale) remove.run(d.readingId)
  })()
  return stale.length
}
