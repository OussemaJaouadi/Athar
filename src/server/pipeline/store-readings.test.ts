import { Database } from 'bun:sqlite'
import { describe, expect, test } from 'bun:test'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import * as sqliteVec from 'sqlite-vec'

import { build } from './build'
import { ingest } from './collect'
import { laneNotes, storeReadings } from './store-readings'
import type { RegistryRow } from './registry'

// The lanes step, run through the real pipeline. Run with: bun test

const row = (over: Partial<RegistryRow> = {}): RegistryRow => ({
  name: 'Relead', desc: 'Free Wi-Fi paid by an 8-second advert.', sector: 'Ad Tech and Creative Tech', industry: 'Ad Tech and Creative Tech',
  website: 'https://relead.tn/', founders: ['Hadhami Rjiba', 'Rayen Cherni'], label: '12/2022', creation_year: '2021',
  email: 'n.a.', phone: 'n.a.', logo: 'https://startup.gov.tn/sites/default/files/2021-10/startuptunisia.png', ...over,
})
const body = (rows: RegistryRow[]) => new TextEncoder().encode(JSON.stringify(rows))

function database() {
  const db = new Database(':memory:', { strict: true })
  db.run('PRAGMA foreign_keys = ON')
  sqliteVec.load(db)
  const dir = join(import.meta.dir, '..', 'migrations')
  for (const file of readdirSync(dir).sort()) db.run(readFileSync(join(dir, file), 'utf8'))
  return db
}
const run = (db: Database) => build.run({ db, runId: 'test' }) as { itemsOut: number; message: string; notes: { code: string; count: number }[] }

const Rows: RegistryRow[] = [
  row({ name: 'VENARI SECURITY TUNISIA', desc: 'Security software for ministries.', sector: 'Cyber Security', website: 'https://venari.tn', founders: ['Luay BEN ALI', 'Sami Jebali'] }),
  row({ name: 'Smart Med SA', desc: 'Telemedicine platform.', sector: 'Health', website: 'https://smartmed.tn', founders: ['Mehdi Sassi'] }),
  row({ name: 'Kelma Tech', desc: 'Translation tools for schools.', sector: 'Education', website: 'https://kelma.tn', founders: ['Luay Ben Ali', 'Sami Jebali'] }),
  row(),
]

function seeded(vectors = false) {
  const db = database()
  ingest(db, body(Rows), null)
  run(db)
  if (vectors) {
    const add = db.query('INSERT INTO startup_vectors (startup_id, embedding) VALUES (?, ?)')
    // 1024 dimensions, as the vec0 table declares; the vectors point almost the same way.
    const vector = (tilt: number) => {
      const values = new Float32Array(1024)
      values[0] = 1
      values[1] = tilt
      return new Uint8Array(values.buffer)
    }
    const ids = db.query<{ id: string }, []>('SELECT id FROM startups ORDER BY id').all().map((r) => r.id)
    for (const [i, id] of ids.entries()) add.run(id, vector(0.01 * i))
    storeReadings(db) // Build ran before the vectors existed; the next store sees them
  }
  return db
}

const idOf = (db: Database, name: string) => db.query<{ id: string }, [string]>('SELECT id FROM startups WHERE name = ?').get(name)!.id
const readingRows = (db: Database) => db.query<{ id: string; kind: string; subject: string; value: string; lane: string }, []>('SELECT id, kind, subject, value, lane FROM readings ORDER BY id').all()

describe('storeReadings', () => {
  test('stores readings with unique ids, JSON values and only the three lanes', () => {
    const db = seeded()
    const rows = readingRows(db)
    expect(rows.length).toBeGreaterThan(0)
    expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length)
    for (const r of rows) expect(() => JSON.parse(r.value)).not.toThrow()
    for (const r of rows) expect(['rule', 'inferred', 'review']).toContain(r.lane)
  })

  test('sets standard display names and legal form on startups', () => {
    const db = seeded()
    const venari = db.query<{ display_name: string | null; legal_form: string | null }, [string]>('SELECT display_name, legal_form FROM startups WHERE name = ?').get('VENARI SECURITY TUNISIA')
    expect(venari?.display_name).toBe('Venari Security Tunisia')
    expect(venari?.legal_form).toBeNull()
    const smart = db.query<{ display_name: string | null; legal_form: string | null }, [string]>('SELECT display_name, legal_form FROM startups WHERE name = ?').get('Smart Med SA')
    expect(smart?.display_name).toBe('Smart Med')
    expect(smart?.legal_form).toBe('SA')
    const relead = db.query<{ display_name: string | null; legal_form: string | null }, []>("SELECT display_name, legal_form FROM startups WHERE name = 'Relead'").get()
    expect(relead).toEqual({ display_name: null, legal_form: null })
  })

  test('sets founder display names only where the casing changes', () => {
    const db = seeded()
    const luay = db.query<{ display_name: string | null }, [string]>("SELECT display_name FROM founders WHERE name = ?").get('Luay BEN ALI')
    expect(luay?.display_name).toBe('Luay Ben Ali')
    const kept = db.query<{ display_name: string | null }, []>("SELECT display_name FROM founders WHERE name = 'Luay Ben Ali'").get()
    expect(kept?.display_name).toBeNull()
    const relead = db.query<{ display_name: string | null }, []>("SELECT display_name FROM founders WHERE name = 'Rayen Cherni'").get()
    expect(relead?.display_name).toBeNull()
  })

  test('derives a relation for the pair that shares two founders', () => {
    const db = seeded()
    const a = idOf(db, 'VENARI SECURITY TUNISIA')
    const b = idOf(db, 'Kelma Tech')
    const pair = [a, b].sort().join('|')
    const relation = readingRows(db).find((r) => r.kind === 'relation' && r.subject === pair)
    expect(relation).toBeDefined()
    expect(JSON.parse(relation!.value).shared).toBe(2)
    expect(JSON.parse(relation!.value).similarity).toBeNull()
  })

  test('uses description similarity when vectors exist', () => {
    const db = seeded(true)
    const a = idOf(db, 'VENARI SECURITY TUNISIA')
    const b = idOf(db, 'Kelma Tech')
    const pair = [a, b].sort().join('|')
    const relation = readingRows(db).find((r) => r.kind === 'relation' && r.subject === pair)
    const similarity = JSON.parse(relation!.value).similarity
    expect(typeof similarity).toBe('number')
    expect(similarity).toBeGreaterThan(0.9)
  })

  test('works with an empty startup_vectors table, similarity null', () => {
    const db = seeded()
    expect(db.query<{ n: number }, []>('SELECT COUNT(*) AS n FROM startup_vectors').get()?.n).toBe(0)
    expect(() => storeReadings(db)).not.toThrow()
    const relations = readingRows(db).filter((r) => r.kind === 'relation')
    expect(relations.length).toBeGreaterThan(0)
    for (const r of relations) expect(JSON.parse(r.value).similarity).toBeNull()
  })

  test('is idempotent: same row count and ids on a second run', () => {
    const db = seeded()
    const before = readingRows(db).map((r) => r.id)
    const result = storeReadings(db)
    const after = readingRows(db).map((r) => r.id)
    expect(after.length).toBe(before.length)
    expect(after).toEqual(before)
    expect(result.total).toBe(before.length)
    expect(result.rule + result.inferred + result.review).toBe(result.total)
  })

  test('keeps decisions across a second run', () => {
    const db = seeded()
    db.run("INSERT INTO decisions (reading_id, basis, value, note, decided_at) VALUES ('name:x', 'b1', '\"kept\"', NULL, '2026-11-18T00:00:00Z')")
    storeReadings(db)
    const kept = db.query<{ value: string }, []>("SELECT value FROM decisions WHERE reading_id = 'name:x'").get()
    expect(kept?.value).toBe('"kept"')
    expect(db.query<{ n: number }, []>('SELECT COUNT(*) AS n FROM decisions').get()?.n).toBe(1)
  })

  test('reports the counts it stored', () => {
    const db = seeded()
    const result = storeReadings(db)
    expect(result.total).toBe(readingRows(db).length)
    expect(result.displayNames).toBe(db.query<{ n: number }, []>('SELECT COUNT(*) AS n FROM startups WHERE display_name IS NOT NULL').get()?.n ?? -1)
    expect(result.founderNames).toBe(db.query<{ n: number }, []>('SELECT COUNT(*) AS n FROM founders WHERE display_name IS NOT NULL').get()?.n ?? -1)
    expect(result.displayNames).toBe(2)
    expect(result.founderNames).toBeGreaterThanOrEqual(1)
  })
})

describe('build with lanes', () => {
  test('returns lane notes after the other notes', () => {
    const db = database()
    ingest(db, body(Rows), null)
    const result = run(db)
    const codes = result.notes.map((n) => n.code)
    expect(codes.includes('lane_rule') || codes.includes('lane_inferred')).toBe(true)
    const laneAt = Math.min(...['lane_rule', 'lane_inferred'].map((c) => codes.indexOf(c)).filter((i) => i >= 0))
    expect(codes.indexOf('startups_new')).toBeLessThan(laneAt)
    expect(result.notes.filter((n) => n.code.startsWith('lane_')).every((n) => n.count > 0)).toBe(true)
  })
})

describe('laneNotes', () => {
  test('drops zero counts and keeps the fixed order', () => {
    expect(laneNotes({ total: 0, rule: 0, inferred: 0, review: 0, displayNames: 0, founderNames: 0 })).toEqual([])
    const notes = laneNotes({ total: 5, rule: 3, inferred: 0, review: 2, displayNames: 0, founderNames: 0 })
    expect(notes.map((n) => n.code)).toEqual(['lane_rule', 'lane_review'])
    expect(notes[0]).toEqual({ code: 'lane_rule', count: 3, text: 'readings settled by a rule' })
    expect(notes[1]).toEqual({ code: 'lane_review', count: 2, text: 'readings that wait for a decision' })
  })
})
