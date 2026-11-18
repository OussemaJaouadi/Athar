import { Database } from 'bun:sqlite'
import { describe, expect, test } from 'bun:test'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import * as sqliteVec from 'sqlite-vec'

import type { Lane } from './lanes'
import {
  decideReading,
  effective,
  followOf,
  forgetStale,
  loadDecisions,
  loadReadings,
  reviewQueue,
  reviewSummary,
  sharedPersonKeys,
  undoDecision,
} from './review'

// The operator's review of readings. Run with: bun test

function database() {
  const db = new Database(':memory:', { strict: true })
  db.run('PRAGMA foreign_keys = ON')
  sqliteVec.load(db)
  const dir = join(import.meta.dir, '..', 'migrations')
  for (const file of readdirSync(dir).sort()) db.run(readFileSync(join(dir, file), 'utf8'))
  return db
}

type Put = {
  id: string
  kind: 'name' | 'alias' | 'founder' | 'person' | 'person_pair' | 'relation' | 'website'
  subject: string
  lane: Lane
  basis?: string
  value?: unknown
  rule?: string
}

function put(db: Database, { id, kind, subject, lane, basis = 'b1', value = { v: id }, rule = `${kind}.rule` }: Put) {
  db.run('INSERT INTO readings (id, kind, subject, value, lane, rule, why, basis) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [
    id,
    kind,
    subject,
    JSON.stringify(value),
    lane,
    rule,
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

describe('following person readings', () => {
  const ONE = 'relation.one-founder-only'

  // A startup with founders in published order. Person keys are the trimmed, lower-cased names.
  function startup(db: Database, id: string, names: string[]) {
    const at = '2026-11-01T00:00:00.000Z'
    db.run("INSERT OR IGNORE INTO downloads (id, url, fetched_at, last_checked_at, content_hash, byte_size, row_count) VALUES (1, 'registry', 'x', 'x', 'x', 1, 1)")
    db.run('INSERT INTO entries (id, raw_json, first_download, last_download) VALUES (?, ?, 1, 1)', [`entry-${id}`, '{}'])
    db.run('INSERT INTO startups (id, entry_id, name, first_download, last_download, created_at, updated_at) VALUES (?, ?, ?, 1, 1, ?, ?)', [
      id,
      `entry-${id}`,
      id,
      at,
      at,
    ])
    names.forEach((name, position) => {
      db.run('INSERT INTO founders (startup_id, position, name, person_key) VALUES (?, ?, ?, ?)', [id, position, name, name.trim().toLowerCase()])
    })
  }

  const relation = (db: Database, subject: string, rule = ONE) =>
    put(db, { id: `relation:${subject}`, kind: 'relation', subject, lane: 'review', rule, value: { relation: 'unrelated', shared: 1, similarity: 0.5 } })

  const person = (db: Database, key: string, value: unknown = { same: true, startups: [] }) =>
    put(db, { id: `person:${key}`, kind: 'person', subject: key, lane: 'review', value })

  // s1, s2 share one name; s3, s4 share one name; s5, s6 share two names; s7, s8 share 'zed' (plus an empty key).
  function setup() {
    const db = database()
    startup(db, 's1', ['Boudhraa Mehdi', 'Alice'])
    startup(db, 's2', ['Boudhraa Mehdi', 'Bob'])
    startup(db, 's3', ['Abid Khouloud', 'Carol'])
    startup(db, 's4', ['Abid Khouloud', 'Dan'])
    startup(db, 's5', ['Eve Adam', 'Frank Ben', 'Gina'])
    startup(db, 's6', ['Eve Adam', 'Frank Ben', 'Hal'])
    startup(db, 's7', ['Zed', ''])
    startup(db, 's8', ['', 'Zed'])
    startup(db, 's9', ['Unrelated Person'])
    person(db, 'boudhraa mehdi')
    person(db, 'abid khouloud')
    relation(db, 's1|s2')
    relation(db, 's3|s4')
    relation(db, 's5|s6')
    return db
  }

  test('sharedPersonKeys lists the shared keys of two startups, sorted, and nothing for unrelated ones', () => {
    const db = setup()
    expect(sharedPersonKeys(db, 's1', 's2')).toEqual(['boudhraa mehdi'])
    expect(sharedPersonKeys(db, 's2', 's1')).toEqual(['boudhraa mehdi'])
    expect(sharedPersonKeys(db, 's3', 's4')).toEqual(['abid khouloud'])
    expect(sharedPersonKeys(db, 's5', 's6')).toEqual(['eve adam', 'frank ben'])
    expect(sharedPersonKeys(db, 's1', 's3')).toEqual([])
    expect(sharedPersonKeys(db, 's1', 's9')).toEqual([])
    expect(sharedPersonKeys(db, 's7', 's8')).toEqual(['zed'])
  })

  test('with nothing decided, the open queue leaves out the relations that wait on a person', () => {
    const db = setup()
    expect(ids(reviewQueue(db))).toEqual(['person:abid khouloud', 'person:boudhraa mehdi', 'relation:s5|s6'])
    expect(reviewQueue(db).find((i) => i.id === 'relation:s5|s6')?.follows).toBeUndefined()

    const following = reviewQueue(db, { include: 'following' })
    expect(ids(following)).toEqual(['relation:s1|s2', 'relation:s3|s4'])
    expect(following[0].follows).toEqual({ personId: 'person:boudhraa mehdi', key: 'boudhraa mehdi', state: 'waiting' })
    expect(following[1].follows?.state).toBe('waiting')

    expect(reviewSummary(db)).toMatchObject({ toAnswer: 3, waitingOnPerson: 2, followed: 0 })
    expect(reviewSummary(db).byKind).toEqual([
      { kind: 'person', open: 2, decided: 0 },
      { kind: 'relation', open: 1, decided: 0 },
    ])
  })

  test('deciding a person "different" marks its relation as different and keeps it out of the queue', () => {
    const db = setup()
    decideReading(db, { id: 'person:boudhraa mehdi', value: { same: false, startups: [] } })
    expect(ids(reviewQueue(db))).toEqual(['person:abid khouloud', 'relation:s5|s6'])
    const following = reviewQueue(db, { include: 'following' })
    expect(ids(following)).toEqual(['relation:s1|s2', 'relation:s3|s4'])
    expect(following.map((i) => i.follows?.state)).toEqual(['different', 'waiting'])
    expect(reviewSummary(db)).toMatchObject({ toAnswer: 2, waitingOnPerson: 1, followed: 1 })
  })

  test('deciding a person "same" brings its relation back into the queue with state same', () => {
    const db = setup()
    decideReading(db, { id: 'person:boudhraa mehdi', value: { same: false, startups: [] } })
    decideReading(db, { id: 'person:abid khouloud', value: { same: true, startups: [] } })
    const open = reviewQueue(db)
    expect(ids(open)).toEqual(['relation:s3|s4', 'relation:s5|s6'])
    expect(open[0].follows?.state).toBe('same')
    expect(ids(reviewQueue(db, { include: 'following' }))).toEqual(['relation:s1|s2'])
    expect(reviewSummary(db)).toMatchObject({ toAnswer: 2, waitingOnPerson: 0, followed: 1 })
    expect(reviewSummary(db).byKind).toEqual([
      { kind: 'person', open: 0, decided: 2 },
      { kind: 'relation', open: 2, decided: 0 },
    ])
  })

  test('undoing the person decision takes its relation out of the queue again', () => {
    const db = setup()
    decideReading(db, { id: 'person:abid khouloud', value: { same: true, startups: [] } })
    expect(ids(reviewQueue(db))).toContain('relation:s3|s4')
    expect(undoDecision(db, 'person:abid khouloud')).toBe(true)
    expect(ids(reviewQueue(db))).toEqual(['person:abid khouloud', 'person:boudhraa mehdi', 'relation:s5|s6'])
    expect(reviewQueue(db, { include: 'following' })[1].follows?.state).toBe('waiting')
    expect(reviewSummary(db)).toMatchObject({ toAnswer: 3, waitingOnPerson: 2, followed: 0 })
  })

  test('a relation with its own decision is listed as decided whatever the person says', () => {
    const db = setup()
    decideReading(db, { id: 'person:boudhraa mehdi', value: { same: false, startups: [] } })
    decideReading(db, { id: 'relation:s1|s2', value: { relation: 'linked' } })
    const decided = reviewQueue(db, { include: 'decided' })
    expect(ids(decided)).toEqual(['person:boudhraa mehdi', 'relation:s1|s2'])
    expect(decided[1].follows).toBeUndefined()
    expect(ids(reviewQueue(db, { include: 'following' }))).toEqual(['relation:s3|s4'])
    expect(ids(reviewQueue(db, { include: 'all' }))).toContain('relation:s1|s2')
    expect(reviewSummary(db)).toMatchObject({ toAnswer: 2, waitingOnPerson: 1, followed: 0 })

    decideReading(db, { id: 'person:boudhraa mehdi', value: { same: true, startups: [] } })
    expect(ids(reviewQueue(db, { include: 'decided' }))).toEqual(['person:boudhraa mehdi', 'relation:s1|s2'])
    expect(reviewQueue(db, { include: 'decided' })[1].decided?.value).toEqual({ relation: 'linked' })
  })

  test('a relation with another rule is never followed', () => {
    const db = setup()
    startup(db, 's10', ['Kim Lee'])
    startup(db, 's11', ['Kim Lee'])
    person(db, 'kim lee')
    relation(db, 's10|s11', 'relation.same-team')
    expect(ids(reviewQueue(db))).toContain('relation:s10|s11')
    expect(reviewQueue(db).find((i) => i.id === 'relation:s10|s11')?.follows).toBeUndefined()
    expect(ids(reviewQueue(db, { include: 'following' }))).not.toContain('relation:s10|s11')
    decideReading(db, { id: 'person:kim lee', value: { same: false, startups: [] } })
    expect(ids(reviewQueue(db))).toContain('relation:s10|s11')
    expect(reviewSummary(db).followed).toBe(0)
  })

  test('a settled person reading with same false also makes its relation different', () => {
    const db = setup()
    startup(db, 's12', ['Zed', 'Other'])
    startup(db, 's13', ['Zed', 'Third'])
    put(db, { id: 'person:zed', kind: 'person', subject: 'zed', lane: 'rule', value: { same: false, startups: [] } })
    relation(db, 's12|s13')
    expect(reviewQueue(db, { include: 'following' }).find((i) => i.id === 'relation:s12|s13')?.follows?.state).toBe('different')
    expect(ids(reviewQueue(db))).not.toContain('relation:s12|s13')
  })

  test('a relation with two shared names, or no person reading, is never followed', () => {
    const db = setup()
    const two = followOf(db, effective(db).find((e) => e.id === 'relation:s5|s6')!, effective(db))
    expect(two).toBeNull()
    expect(sharedPersonKeys(db, 's5', 's6')).toHaveLength(2)

    startup(db, 's14', ['Lonely Name'])
    startup(db, 's15', ['Lonely Name'])
    relation(db, 's14|s15')
    expect(followOf(db, effective(db).find((e) => e.id === 'relation:s14|s15')!, effective(db))).toBeNull()
    expect(ids(reviewQueue(db))).toContain('relation:s14|s15')
  })

  test('followOf ignores non-relation kinds and relations that already have a decision', () => {
    const db = setup()
    const all = effective(db)
    expect(followOf(db, all.find((e) => e.id === 'person:boudhraa mehdi')!, all)).toBeNull()
    expect(followOf(db, all.find((e) => e.id === 'relation:s1|s2')!, all)).toMatchObject({ key: 'boudhraa mehdi', state: 'waiting' })
    decideReading(db, { id: 'relation:s1|s2', value: { relation: 'linked' } })
    const decided = effective(db)
    expect(followOf(db, decided.find((e) => e.id === 'relation:s1|s2')!, decided)).toBeNull()
  })

  test('non-relation readings never carry follows and keep their place in the queue', () => {
    const db = setup()
    put(db, { id: 'name:a', kind: 'name', subject: 'a', lane: 'review' })
    const queue = reviewQueue(db)
    expect(ids(queue)).toEqual(['person:abid khouloud', 'person:boudhraa mehdi', 'relation:s5|s6', 'name:a'])
    expect(queue[3].follows).toBeUndefined()
    expect(reviewSummary(db).byKind.map((k) => k.kind)).toEqual(['person', 'relation', 'name'])
  })
})
