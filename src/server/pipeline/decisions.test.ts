import { describe, expect, test } from 'bun:test'
import type { Lane } from './lanes'
import type { Decision, ReadingKind, StoredReading } from './readings'
import {
  applyDecisions,
  decide,
  type Effective,
  KIND_ORDER,
  laneTotals,
  lanePercent,
  reviewQueue,
  staleDecisions,
} from './decisions'

const r = (
  id: string,
  lane: Lane,
  basis = 'b1',
  kind: ReadingKind = 'relation',
  subject = id,
): StoredReading => ({
  id,
  kind,
  subject,
  value: { v: id },
  lane,
  rule: 'x.y',
  why: 'because',
  basis,
})

const d = (readingId: string, value: unknown, basis = 'b1', decidedAt = '2026-11-18T10:00:00Z'): Decision => ({
  readingId,
  basis,
  value,
  note: null,
  decidedAt,
})

describe('applyDecisions', () => {
  test('a matching decision applies and sets the effective value', () => {
    const [e] = applyDecisions([r('a', 'review')], [d('a', { v: 'chosen' })])
    expect(e.decided).toEqual(d('a', { v: 'chosen' }))
    expect(e.open).toBe(false)
    expect(e.effectiveValue).toEqual({ v: 'chosen' })
    expect(e.id).toBe('a')
  })

  test('a reading with no decision stays open when review, and uses its own value', () => {
    const [e] = applyDecisions([r('a', 'review')], [])
    expect(e.decided).toBeNull()
    expect(e.open).toBe(true)
    expect(e.effectiveValue).toEqual({ v: 'a' })
  })

  test('a decision with a different basis does not apply and the reading is open again', () => {
    const [e] = applyDecisions([r('a', 'review', 'b2')], [d('a', { v: 'old' }, 'b1')])
    expect(e.decided).toBeNull()
    expect(e.open).toBe(true)
    expect(e.effectiveValue).toEqual({ v: 'a' })
  })

  test('a decision for a missing reading is ignored by applyDecisions', () => {
    const effective = applyDecisions([r('a', 'review')], [d('ghost', 1)])
    expect(effective).toHaveLength(1)
    expect(effective[0].decided).toBeNull()
  })

  test('two decisions for one reading: the latest decidedAt wins regardless of order', () => {
    const older = d('a', 'older', 'b1', '2026-11-01T00:00:00Z')
    const newer = d('a', 'newer', 'b1', '2026-11-10T00:00:00Z')
    const [e1] = applyDecisions([r('a', 'review')], [newer, older])
    const [e2] = applyDecisions([r('a', 'review')], [older, newer])
    expect(e1.decided).toEqual(newer)
    expect(e1.effectiveValue).toBe('newer')
    expect(e2.decided).toEqual(newer)
  })

  test('a decision on an inferred reading is decided and never open', () => {
    const [e] = applyDecisions([r('a', 'inferred')], [d('a', 'overruled')])
    expect(e.decided).not.toBeNull()
    expect(e.open).toBe(false)
    expect(e.effectiveValue).toBe('overruled')
  })

  test('a decision on a rule reading is applied and the reading is not open', () => {
    const [e] = applyDecisions([r('a', 'rule')], [d('a', 'overruled')])
    expect(e.decided).not.toBeNull()
    expect(e.open).toBe(false)
  })

  test('an inferred reading without a decision is not open', () => {
    const [e] = applyDecisions([r('a', 'inferred')], [])
    expect(e.open).toBe(false)
    expect(e.decided).toBeNull()
  })

  test('output keeps input order and does not mutate inputs', () => {
    const readings = [r('b', 'review'), r('a', 'rule')]
    const decisions = [d('a', 1)]
    const before = structuredClone({ readings, decisions })
    const effective = applyDecisions(readings, decisions)
    expect(effective.map((e) => e.id)).toEqual(['b', 'a'])
    expect(readings).toEqual(before.readings)
    expect(decisions).toEqual(before.decisions)
  })
})

describe('staleDecisions', () => {
  test('a decision whose basis changed is stale; a matching one is not', () => {
    const readings = [r('a', 'review', 'b2'), r('c', 'review', 'b1')]
    const stale = staleDecisions(readings, [d('a', 1, 'b1'), d('c', 2, 'b1')])
    expect(stale).toEqual([d('a', 1, 'b1')])
  })

  test('a decision for a reading that no longer exists is stale', () => {
    const stale = staleDecisions([r('a', 'review')], [d('gone', 1)])
    expect(stale).toHaveLength(1)
    expect(stale[0].readingId).toBe('gone')
  })

  test('keeps input order and returns nothing when all decisions apply', () => {
    const readings = [r('a', 'review'), r('b', 'review')]
    expect(staleDecisions(readings, [d('b', 1), d('a', 2)]).map((x) => x.readingId)).toEqual([])
    const stale = staleDecisions(readings, [d('z', 1), d('y', 2), d('a', 3)])
    expect(stale.map((x) => x.readingId)).toEqual(['z', 'y'])
  })
})

describe('laneTotals', () => {
  test('counts lanes, decided, open and inferredOpen on a mixed set', () => {
    const effective = applyDecisions(
      [
        r('a', 'rule'),
        r('b', 'rule'),
        r('c', 'inferred'),
        r('d', 'inferred'),
        r('e', 'review'),
        r('f', 'review'),
        r('g', 'review'),
      ],
      [d('c', 'x'), d('f', 'y')],
    )
    const t = laneTotals(effective)
    expect(t.rule).toBe(2)
    expect(t.inferred).toBe(2)
    expect(t.review).toBe(3)
    expect(t.decided).toBe(2)
    expect(t.open).toBe(2)
    expect(t.inferredOpen).toBe(1)
    expect(t.rule + t.inferred + t.review).toBe(7)
  })

  test('an empty set gives all zeros', () => {
    expect(laneTotals([])).toEqual({ rule: 0, inferred: 0, review: 0, decided: 0, open: 0, inferredOpen: 0 })
  })
})

describe('reviewQueue', () => {
  test('orders open items by kind, then subject, then id, and excludes decided ones', () => {
    const readings = [
      r('name:z', 'review', 'b1', 'name', 'z'),
      r('relation:m|n', 'review', 'b1', 'relation', 'm|n'),
      r('alias:a:1', 'review', 'b1', 'alias', 'a'),
      r('relation:a|b', 'review', 'b1', 'relation', 'a|b'),
      r('person:p2', 'review', 'b1', 'person', 'p2'),
      r('person:p1', 'review', 'b1', 'person', 'p1'),
      r('website:w', 'review', 'b1', 'website', 'w'),
      r('founder:f', 'review', 'b1', 'founder', 'f'),
      r('name:decided', 'review', 'b1', 'name', 'a0'),
      r('name:rule', 'rule', 'b1', 'name', 'a1'),
    ]
    const effective = applyDecisions(readings, [d('name:decided', 'ok')])
    const queue = reviewQueue(effective)
    expect(queue.map((e) => e.id)).toEqual([
      'relation:a|b',
      'relation:m|n',
      'person:p1',
      'person:p2',
      'website:w',
      'founder:f',
      'alias:a:1',
      'name:z',
    ])
    expect(queue.some((e) => e.id === 'name:decided')).toBe(false)
    expect(queue.some((e) => e.id === 'name:rule')).toBe(false)
  })

  test('does not mutate the input array', () => {
    const effective = applyDecisions([r('b', 'review'), r('a', 'review')], [])
    const before = structuredClone(effective)
    const queue = reviewQueue(effective)
    expect(effective).toEqual(before)
    expect(queue).not.toBe(effective)
    expect(queue.map((e) => e.id)).toEqual(['a', 'b'])
  })

  test('KIND_ORDER lists every reading kind once', () => {
    expect(KIND_ORDER).toEqual(['relation', 'person_pair', 'person', 'website', 'founder', 'alias', 'name'])
    expect(new Set(KIND_ORDER).size).toBe(KIND_ORDER.length)
  })
})

describe('decide', () => {
  test('trims the note and carries the reading id, basis and time', () => {
    const reading = r('a', 'review', 'bx')
    const out = decide(reading, { v: 1 }, '  looks right  ', '2026-11-18T12:00:00Z')
    expect(out).toEqual({
      readingId: 'a',
      basis: 'bx',
      value: { v: 1 },
      note: 'looks right',
      decidedAt: '2026-11-18T12:00:00Z',
    })
  })

  test('a blank note becomes null', () => {
    expect(decide(r('a', 'review'), 1, '  ', 't').note).toBeNull()
    expect(decide(r('a', 'review'), 1, '', 't').note).toBeNull()
    expect(decide(r('a', 'review'), 1, null, 't').note).toBeNull()
  })

  test('a decision built by decide applies to its reading', () => {
    const reading = r('a', 'review', 'bx')
    const [e] = applyDecisions([reading], [decide(reading, 'yes', null, 't')])
    expect(e.open).toBe(false)
    expect(e.effectiveValue).toBe('yes')
  })
})

describe('lanePercent', () => {
  test('empty totals give all zeros', () => {
    expect(lanePercent(laneTotals([]))).toEqual({ settled: 0, inferred: 0, waiting: 0 })
  })

  test('percentages are whole numbers that sum to 100', () => {
    const effective: Effective[] = applyDecisions(
      [r('a', 'rule'), r('b', 'inferred'), r('c', 'review'), r('d', 'review'), r('e', 'rule'), r('f', 'inferred')],
      [d('b', 1)],
    )
    const p = lanePercent(laneTotals(effective))
    // 6 readings: waiting = round(100*2/6)=33, inferred open = 1 -> round(16.67)=17, settled = 50
    expect(p).toEqual({ settled: 50, inferred: 17, waiting: 33 })
    expect(Number.isInteger(p.settled) && Number.isInteger(p.inferred) && Number.isInteger(p.waiting)).toBe(true)
    expect(p.settled + p.inferred + p.waiting).toBe(100)
  })

  test('all-rule readings are fully settled', () => {
    const p = lanePercent(laneTotals(applyDecisions([r('a', 'rule'), r('b', 'rule')], [])))
    expect(p).toEqual({ settled: 100, inferred: 0, waiting: 0 })
  })

  test('sums to 100 for an awkward split', () => {
    const effective = applyDecisions(
      [r('a', 'review'), r('b', 'review'), r('c', 'inferred'), r('d', 'rule'), r('e', 'rule'), r('f', 'rule')],
      [],
    )
    const p = lanePercent(laneTotals(effective))
    expect(p.settled + p.inferred + p.waiting).toBe(100)
  })
})

describe('inputs are not mutated', () => {
  test('applyDecisions, staleDecisions, laneTotals, reviewQueue and lanePercent leave inputs unchanged', () => {
    const readings = [r('a', 'review', 'b2'), r('b', 'inferred'), r('c', 'rule', 'b1', 'name', 'c')]
    const decisions = [d('a', 1, 'b1'), d('b', 2), d('gone', 3)]
    const before = structuredClone({ readings, decisions })

    const effective = applyDecisions(readings, decisions)
    staleDecisions(readings, decisions)
    const totals = laneTotals(effective)
    reviewQueue(effective)
    lanePercent(totals)

    expect(readings).toEqual(before.readings)
    expect(decisions).toEqual(before.decisions)
  })
})
