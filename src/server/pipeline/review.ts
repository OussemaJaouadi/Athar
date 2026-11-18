import type { Database } from 'bun:sqlite'

import { now } from '../ids'
import { applyDecisions, decide, type Effective, laneTotals, lanePercent, type LaneTotals, staleDecisions } from './decisions'
import type { Decision, ReadingKind, StoredReading } from './readings'

// The operator's review of derived readings: load them, apply the decisions, list what waits, record an answer.
// Storage lives in migration 009 (tables `readings` and `decisions`); the rules live in decisions.ts.

type ReadingRow = { id: string; kind: ReadingKind; subject: string; value: string; lane: StoredReading['lane']; rule: string; why: string; basis: string }
type DecisionRow = { reading_id: string; basis: string; value: string; note: string | null; decided_at: string }

/** People first: whether two startups are related often depends on whether a shared name is one person. */
export const REVIEW_ORDER: ReadingKind[] = ['person', 'person_pair', 'relation', 'website', 'founder', 'alias', 'name']

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
  decided: { value: unknown; note: string | null; decidedAt: string } | null
}

export type ReviewSummary = {
  totals: LaneTotals
  percent: { settled: number; inferred: number; waiting: number }
  byKind: { kind: ReadingKind; open: number; decided: number }[]
  /** Decisions that no longer apply (reading gone or basis changed). */
  stale: number
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

const rank = (kind: ReadingKind) => REVIEW_ORDER.indexOf(kind)

function toItem(e: Effective): ReviewItem {
  return {
    id: e.id,
    kind: e.kind,
    subject: e.subject,
    value: e.value,
    rule: e.rule,
    why: e.why,
    lane: e.lane,
    decided: e.decided ? { value: e.decided.value, note: e.decided.note, decidedAt: e.decided.decidedAt } : null,
  }
}

export function reviewQueue(db: Database, options: { kind?: ReadingKind; include?: 'open' | 'decided' | 'all' } = {}): ReviewItem[] {
  const include = options.include ?? 'open'
  return effective(db)
    .filter((e) => {
      if (options.kind !== undefined && e.kind !== options.kind) return false
      if (include === 'open') return e.open
      if (include === 'decided') return e.decided !== null
      return e.open || e.decided !== null
    })
    .sort((a, b) => {
      const byKind = rank(a.kind) - rank(b.kind)
      if (byKind !== 0) return byKind
      if (a.subject !== b.subject) return a.subject < b.subject ? -1 : 1
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
    })
    .map(toItem)
}

export function reviewSummary(db: Database): ReviewSummary {
  const readings = effective(db)
  const totals = laneTotals(readings)
  const byKind = REVIEW_ORDER.map((kind) => {
    const of = readings.filter((e) => e.kind === kind)
    return { kind, open: of.filter((e) => e.open).length, decided: of.filter((e) => e.decided !== null).length }
  }).filter((k) => k.open > 0 || k.decided > 0)
  const stale = staleDecisions(loadReadings(db), loadDecisions(db)).length
  return { totals, percent: lanePercent(totals), byKind, stale }
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
  return toItem({ ...reading, decided: decision, open: false, effectiveValue: decision.value })
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
