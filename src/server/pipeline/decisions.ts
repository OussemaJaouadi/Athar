import type { Decision, ReadingKind, StoredReading } from './readings'

// Operators' decisions applied to stored readings. Pure: no I/O, no database. A decision holds only while the
// reading's basis is unchanged; once the registry edits the row, the question reopens.

export type Effective = StoredReading & {
  /** The decision that applies to this reading, or null. */
  decided: Decision | null
  /** True when the reading still waits for an operator: lane is 'review' and no decision applies. */
  open: boolean
  /** The value to use: the decision's value when one applies, otherwise the reading's own value. */
  effectiveValue: unknown
}

export type LaneTotals = {
  rule: number
  inferred: number
  review: number
  decided: number
  open: number
  /** Inferred-lane readings with no decision applied. */
  inferredOpen: number
}

export const KIND_ORDER: ReadingKind[] = ['relation', 'person_pair', 'person', 'website', 'founder', 'alias', 'name']

/** The decision that applies to a reading: same reading id and same basis; the latest `decidedAt` wins. */
function appliedDecision(reading: StoredReading, decisions: Decision[]): Decision | null {
  let best: Decision | null = null
  for (const d of decisions) {
    if (d.readingId !== reading.id || d.basis !== reading.basis) continue
    if (best === null || d.decidedAt > best.decidedAt) best = d
  }
  return best
}

export function applyDecisions(readings: StoredReading[], decisions: Decision[]): Effective[] {
  return readings.map((reading) => {
    const decided = appliedDecision(reading, decisions)
    return {
      ...reading,
      decided,
      open: reading.lane === 'review' && decided === null,
      effectiveValue: decided ? decided.value : reading.value,
    }
  })
}

/** Decisions that no longer apply: the reading is gone, or its basis has changed. Input order is kept. */
export function staleDecisions(readings: StoredReading[], decisions: Decision[]): Decision[] {
  const byId = new Map(readings.map((r) => [r.id, r]))
  return decisions.filter((d) => {
    const reading = byId.get(d.readingId)
    return reading === undefined || reading.basis !== d.basis
  })
}

export function laneTotals(effective: Effective[]): LaneTotals {
  const totals: LaneTotals = { rule: 0, inferred: 0, review: 0, decided: 0, open: 0, inferredOpen: 0 }
  for (const e of effective) {
    totals[e.lane] += 1
    if (e.decided !== null) totals.decided += 1
    if (e.open) totals.open += 1
    if (e.lane === 'inferred' && e.decided === null) totals.inferredOpen += 1
  }
  return totals
}

/** Open readings only, ordered by kind (KIND_ORDER), then subject, then id. */
export function reviewQueue(effective: Effective[]): Effective[] {
  const rank = (kind: ReadingKind) => KIND_ORDER.indexOf(kind)
  return effective
    .filter((e) => e.open)
    .sort((a, b) => {
      const byKind = rank(a.kind) - rank(b.kind)
      if (byKind !== 0) return byKind
      if (a.subject !== b.subject) return a.subject < b.subject ? -1 : 1
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
    })
}

/** The decision an operator gives on a reading. A blank note becomes null. */
export function decide(reading: StoredReading, value: unknown, note: string | null, at: string): Decision {
  const trimmed = note ? note.trim() : ''
  return {
    readingId: reading.id,
    basis: reading.basis,
    value,
    note: trimmed ? trimmed : null,
    decidedAt: at,
  }
}

export function lanePercent(totals: LaneTotals): { settled: number; inferred: number; waiting: number } {
  const total = totals.rule + totals.inferred + totals.review
  if (total === 0) return { settled: 0, inferred: 0, waiting: 0 }
  const waiting = Math.round((100 * totals.open) / total)
  const inferred = Math.round((100 * totals.inferredOpen) / total)
  return { settled: 100 - waiting - inferred, inferred, waiting }
}
