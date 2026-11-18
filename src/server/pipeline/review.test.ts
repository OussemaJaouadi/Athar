import { Database } from 'bun:sqlite'
import { describe, expect, test } from 'bun:test'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import * as sqliteVec from 'sqlite-vec'

import type { Lane } from './lanes'
import { decideReading, effective, forgetStale, loadDecisions, loadReadings, reviewQueue, reviewSummary, undoDecision } from './review'

// The operator's review of readings. Run with: bun test

function database() {
  const db = new Database(':memory:', { strict: true })
  db.run('PRAGMA foreign_keys = ON')
  sqliteVec.load(db)
  const dir = join(import.meta.dir, '..', 'migrations')
  for (const file of readdirSync(dir).sort()) db.run(readFileSync(join(dir, file), 'utf8'))
  return db
}

type Put = { id: string; kind: 'name' | 'alias' | 'founder' | 'person' | 'person_pair' | 'relation' | 'website'; subject: string; lane: Lane; basis?: string; value?: unknown }

function put(db: Database, { id, kind, subject, lane, basis = 'b1', value = { v: id } }: Put) {
  db.run('INSERT INTO readings (id, kind, subject, value, lane, rule, why, basis) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [
    id,
    kind,
    subject,
    JSON.stringify(value),
    lane,
    `${kind}.rule`,
    `because ${id}`,
    basis,
  ])
}

const ids = (items: { id: string }[]) => items.map((i) => i.id)

describe('loading', () => {
  test('loadReadings parses JSON values and orders by id', () => {
    const db = database()
    put(db, { id: 'name:b', kind: 'name', subject: 'b', lane: 'rule', value: { display: 'Beta', n: 2 } })
    put(db, { id: 'name:a', kind: 'name', subject: 'a', lane: 'rule', value: ['x', 1, null] })
    const readings = loadReadings(db)
    expect(readings.map((r) => r.id)).toEqual(['name:a', 'name:b'])
    expect(readings[0].value).toEqual(['x', 1, null])
    expect(readings[1].value).toEqual({ display: 'Beta', n: 2 })
    expect(readings[1].rule).toBe('name.rule')
    expect(readings[1].basis).toBe('b1')
  })

  test('loadDecisions parses JSON values and maps columns', () => {
    const db = database()
    put(db, { id: 'name:a', kind: 'name', subject: 'a', lane: 'review' })
    db.run("INSERT INTO decisions (reading_id, basis, value, note, decided_at) VALUES ('name:a', 'b1', '\"Alpha\"', 'checked', '2026-11-01T00:00:00.000Z')")
    const [decision] = loadDecisions(db)
    expect(decision).toEqual({ readingId: 'name:a', basis: 'b1', value: 'Alpha', note: 'checked', decidedAt: '2026-11-01T00:00:00.000Z' })
    expect(effective(db)[0].decided?.value).toBe('Alpha')
  })
})

describe('empty database', () => {
  test('gives an empty queue and a zero summary', () => {
    const db = database()
    expect(reviewQueue(db)).toEqual([])
    expect(reviewQueue(db, { include: 'decided' })).toEqual([])
    expect(reviewQueue(db, { include: 'all' })).toEqual([])
    const summary = reviewSummary(db)
    expect(summary.totals).toEqual({ rule: 0, inferred: 0, review: 0, decided: 0, open: 0, inferredOpen: 0 })
    expect(summary.percent).toEqual({ settled: 0, inferred: 0, waiting: 0 })
    expect(summary.byKind).toEqual([])
    expect(summary.stale).toBe(0)
  })
})

describe('queue', () => {
  test('orders across kinds by REVIEW_ORDER, then subject, then id', () => {
    const db = database()
    put(db, { id: 'name:a', kind: 'name', subject: 'a', lane: 'review' })
    put(db, { id: 'alias:z:1', kind: 'alias', subject: 'z', lane: 'review' })
    put(db, { id: 'website:b', kind: 'website', subject: 'b', lane: 'review' })
    put(db, { id: 'person:k2', kind: 'person', subject: 'k2', lane: 'review' })
    put(db, { id: 'person:k1', kind: 'person', subject: 'k1', lane: 'review' })
    put(db, { id: 'person_pair:x|y', kind: 'person_pair', subject: 'x|y', lane: 'review' })
    put(db, { id: 'relation:s2', kind: 'relation', subject: 's2', lane: 'review' })
    expect(ids(reviewQueue(db))).toEqual(['person:k1', 'person:k2', 'person_pair:x|y', 'relation:s2', 'website:b', 'alias:z:1', 'name:a'])
  })

  test('breaks ties within a kind by id when subjects match', () => {
    const db = database()
    put(db, { id: 'alias:s:2', kind: 'alias', subject: 's', lane: 'review' })
    put(db, { id: 'alias:s:1', kind: 'alias', subject: 's', lane: 'review' })
    expect(ids(reviewQueue(db))).toEqual(['alias:s:1', 'alias:s:2'])
  })

  test('filters by kind', () => {
    const db = database()
    put(db, { id: 'name:a', kind: 'name', subject: 'a', lane: 'review' })
    put(db, { id: 'founder:a#0', kind: 'founder', subject: 'a#0', lane: 'review' })
    put(db, { id: 'person:p', kind: 'person', subject: 'p', lane: 'review' })
    expect(ids(reviewQueue(db, { kind: 'name' }))).toEqual(['name:a'])
    expect(ids(reviewQueue(db, { kind: 'founder' }))).toEqual(['founder:a#0'])
    expect(reviewQueue(db, { kind: 'relation' })).toEqual([])
  })

  test('open queue holds only review-lane readings and skips rule and inferred', () => {
    const db = database()
    put(db, { id: 'name:r', kind: 'name', subject: 'r', lane: 'rule' })
    put(db, { id: 'name:i', kind: 'name', subject: 'i', lane: 'inferred' })
    put(db, { id: 'name:v', kind: 'name', subject: 'v', lane: 'review' })
    expect(ids(reviewQueue(db))).toEqual(['name:v'])
    expect(reviewQueue(db)[0]).toMatchObject({ kind: 'name', subject: 'v', lane: 'review', decided: null, rule: 'name.rule', why: 'because name:v' })
  })
})

describe('deciding', () => {
  test('decideReading stores a decision and moves the item out of the open queue', () => {
    const db = database()
    put(db, { id: 'name:a', kind: 'name', subject: 'a', lane: 'review', value: 'Alpha Co' })
    const item = decideReading(db, { id: 'name:a', value: 'Alpha', note: '  checked the site  ' })
    expect(item.id).toBe('name:a')
    expect(item.value).toBe('Alpha Co')
    expect(item.decided).toMatchObject({ value: 'Alpha', note: 'checked the site' })
    expect(typeof item.decided?.decidedAt).toBe('string')
    expect(reviewQueue(db)).toEqual([])
    expect(ids(reviewQueue(db, { include: 'decided' }))).toEqual(['name:a'])
    expect(ids(reviewQueue(db, { include: 'all' }))).toEqual(['name:a'])
    expect(loadDecisions(db)).toHaveLength(1)
  })

  test('a blank or missing note is stored as null', () => {
    const db = database()
    put(db, { id: 'name:a', kind: 'name', subject: 'a', lane: 'review' })
    put(db, { id: 'name:b', kind: 'name', subject: 'b', lane: 'review' })
    expect(decideReading(db, { id: 'name:a', value: 1, note: '   ' }).decided?.note).toBeNull()
    expect(decideReading(db, { id: 'name:b', value: 2 }).decided?.note).toBeNull()
  })

  test('deciding twice replaces the first decision and keeps one row', () => {
    const db = database()
    put(db, { id: 'name:a', kind: 'name', subject: 'a', lane: 'review' })
    decideReading(db, { id: 'name:a', value: 'First', note: 'one' })
    const second = decideReading(db, { id: 'name:a', value: 'Second' })
    expect(second.decided).toMatchObject({ value: 'Second', note: null })
    const rows = db.query<{ value: string; note: string | null }, []>('SELECT value, note FROM decisions').all()
    expect(rows).toEqual([{ value: '"Second"', note: null }])
  })

  test('a decision on an inferred reading shows under decided but was never open', () => {
    const db = database()
    put(db, { id: 'relation:a|b', kind: 'relation', subject: 'a|b', lane: 'inferred' })
    expect(reviewQueue(db)).toEqual([])
    decideReading(db, { id: 'relation:a|b', value: 'same founder' })
    expect(ids(reviewQueue(db, { include: 'decided' }))).toEqual(['relation:a|b'])
    expect(reviewQueue(db, { include: 'open' })).toEqual([])
    expect(reviewSummary(db).totals).toMatchObject({ inferred: 1, decided: 1, open: 0, inferredOpen: 0 })
  })

  test('decideReading on a missing id throws', () => {
    const db = database()
    expect(() => decideReading(db, { id: 'name:nope', value: 1 })).toThrow('No reading with this id')
    expect(db.query('SELECT COUNT(*) AS n FROM decisions').get()).toEqual({ n: 0 })
  })

  test('undoDecision returns true then false and reopens the item', () => {
    const db = database()
    put(db, { id: 'name:a', kind: 'name', subject: 'a', lane: 'review' })
    decideReading(db, { id: 'name:a', value: 'x' })
    expect(undoDecision(db, 'name:a')).toBe(true)
    expect(undoDecision(db, 'name:a')).toBe(false)
    expect(undoDecision(db, 'name:missing')).toBe(false)
    expect(ids(reviewQueue(db))).toEqual(['name:a'])
    expect(reviewQueue(db)[0].decided).toBeNull()
  })
})

describe('stale decisions', () => {
  test('a changed basis reopens the item, counts as stale, and forgetStale removes it', () => {
    const db = database()
    put(db, { id: 'name:a', kind: 'name', subject: 'a', lane: 'review', basis: 'b1' })
    decideReading(db, { id: 'name:a', value: 'kept' })
    expect(reviewQueue(db, { include: 'decided' })).toHaveLength(1)

    db.run("UPDATE readings SET basis = 'b2' WHERE id = 'name:a'")
    expect(ids(reviewQueue(db))).toEqual(['name:a'])
    expect(reviewQueue(db)[0].decided).toBeNull()
    expect(reviewQueue(db, { include: 'decided' })).toEqual([])
    expect(reviewSummary(db).stale).toBe(1)

    expect(forgetStale(db)).toBe(1)
    expect(db.query('SELECT COUNT(*) AS n FROM decisions').get()).toEqual({ n: 0 })
    expect(reviewSummary(db).stale).toBe(0)
    expect(forgetStale(db)).toBe(0)
  })

  test('a decision whose reading is gone is stale and forgotten', () => {
    const db = database()
    put(db, { id: 'name:a', kind: 'name', subject: 'a', lane: 'review' })
    decideReading(db, { id: 'name:a', value: 1 })
    db.run("DELETE FROM readings WHERE id = 'name:a'")
    expect(reviewSummary(db).stale).toBe(1)
    expect(forgetStale(db)).toBe(1)
    expect(loadDecisions(db)).toEqual([])
  })

  test('a current decision is not stale and survives forgetStale', () => {
    const db = database()
    put(db, { id: 'name:a', kind: 'name', subject: 'a', lane: 'review' })
    put(db, { id: 'name:b', kind: 'name', subject: 'b', lane: 'review', basis: 'old' })
    decideReading(db, { id: 'name:a', value: 1 })
    decideReading(db, { id: 'name:b', value: 2 })
    db.run("UPDATE readings SET basis = 'new' WHERE id = 'name:b'")
    expect(reviewSummary(db).stale).toBe(1)
    expect(forgetStale(db)).toBe(1)
    expect(loadDecisions(db).map((d) => d.readingId)).toEqual(['name:a'])
  })
})

describe('summary', () => {
  test('totals and percentages cover all lanes and sum to 100', () => {
    const db = database()
    put(db, { id: 'name:r1', kind: 'name', subject: 'r1', lane: 'rule' })
    put(db, { id: 'name:r2', kind: 'name', subject: 'r2', lane: 'rule' })
    put(db, { id: 'name:r3', kind: 'name', subject: 'r3', lane: 'rule' })
    put(db, { id: 'alias:i1:1', kind: 'alias', subject: 'i1', lane: 'inferred' })
    put(db, { id: 'alias:i2:1', kind: 'alias', subject: 'i2', lane: 'inferred' })
    put(db, { id: 'person:v', kind: 'person', subject: 'v', lane: 'review' })
    const summary = reviewSummary(db)
    expect(summary.totals).toEqual({ rule: 3, inferred: 2, review: 1, decided: 0, open: 1, inferredOpen: 2 })
    expect(summary.totals.rule + summary.totals.inferred + summary.totals.review).toBe(6)
    expect(summary.percent).toEqual({ waiting: 17, inferred: 33, settled: 50 })
    expect(summary.percent.settled + summary.percent.inferred + summary.percent.waiting).toBe(100)
  })

  test('percentages sum to 100 after decisions', () => {
    const db = database()
    put(db, { id: 'name:v1', kind: 'name', subject: 'v1', lane: 'review' })
    put(db, { id: 'name:v2', kind: 'name', subject: 'v2', lane: 'review' })
    put(db, { id: 'name:v3', kind: 'name', subject: 'v3', lane: 'review' })
    decideReading(db, { id: 'name:v1', value: 1 })
    const summary = reviewSummary(db)
    expect(summary.totals).toMatchObject({ review: 3, decided: 1, open: 2 })
    expect(summary.percent).toEqual({ waiting: 67, inferred: 0, settled: 33 })
    expect(summary.percent.settled + summary.percent.inferred + summary.percent.waiting).toBe(100)
  })

  test('byKind lists kinds in REVIEW_ORDER with open and decided counts, skipping empty kinds', () => {
    const db = database()
    put(db, { id: 'name:a', kind: 'name', subject: 'a', lane: 'review' })
    put(db, { id: 'name:b', kind: 'name', subject: 'b', lane: 'review' })
    put(db, { id: 'person:p', kind: 'person', subject: 'p', lane: 'review' })
    put(db, { id: 'person:q', kind: 'person', subject: 'q', lane: 'inferred' })
    put(db, { id: 'website:w', kind: 'website', subject: 'w', lane: 'rule' })
    decideReading(db, { id: 'name:a', value: 'A' })
    decideReading(db, { id: 'person:q', value: 'done' })
    const { byKind } = reviewSummary(db)
    expect(byKind).toEqual([
      { kind: 'person', open: 1, decided: 1 },
      { kind: 'name', open: 1, decided: 1 },
    ])
    expect(byKind.map((k) => k.kind)).not.toContain('website')
    expect(byKind.map((k) => k.kind)).not.toContain('relation')
  })

  test('byKind keeps kinds that are only decided, with open at zero', () => {
    const db = database()
    put(db, { id: 'relation:a|b', kind: 'relation', subject: 'a|b', lane: 'inferred' })
    decideReading(db, { id: 'relation:a|b', value: 'linked' })
    expect(reviewSummary(db).byKind).toEqual([{ kind: 'relation', open: 0, decided: 1 }])
  })
})
