import { Database } from 'bun:sqlite'
import { describe, expect, test } from 'bun:test'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import * as sqliteVec from 'sqlite-vec'

import { derivedSets, namesMatch, parseVentures, parseWebsite, unconfirmedKeys } from './archive-sets'

function database() {
  const db = new Database(':memory:', { strict: true })
  db.run('PRAGMA foreign_keys = ON')
  sqliteVec.load(db)
  const dir = join(import.meta.dir, '..', 'migrations')
  for (const file of readdirSync(dir).sort()) db.run(readFileSync(join(dir, file), 'utf8'))
  db.run("INSERT INTO downloads (id, url, fetched_at, last_checked_at, content_hash, byte_size, row_count) VALUES (1, 'u', 't', 't', 'h', 1, 1)")
  for (const id of ['a', 'b', 'c', 'd']) {
    db.run("INSERT INTO entries (id, raw_json, first_download, last_download) VALUES (?, '{}', 1, 1)", [`e-${id}`])
    db.run("INSERT INTO startups (id, entry_id, name, labelled, first_download, last_download, created_at, updated_at) VALUES (?, ?, ?, '2022-05', 1, 1, 't', 't')", [id, `e-${id}`, id])
    db.run('INSERT INTO founders (startup_id, position, name, person_key) VALUES (?, 0, ?, ?)', [id, 'x', 'x'])
  }
  return db
}
const reading = (db: Database, id: string, kind: string, subject: string, value: unknown, rule: string, lane = 'rule') =>
  db.run('INSERT INTO readings (id, kind, subject, value, lane, rule, why, basis) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [id, kind, subject, JSON.stringify(value), lane, rule, 'why', 'b1'])

describe('filters', () => {
  test('parsing keeps only known values', () => {
    expect(parseWebsite('moved')).toBe('moved')
    expect(parseWebsite('yes')).toBe('yes')
    expect(parseWebsite('maybe')).toBeUndefined()
    expect(parseVentures('names')).toBe('names')
    expect(parseVentures(1)).toBeUndefined()
  })
  test('every typed word must start a word of one name', () => {
    expect(namesMatch(['Aerobot', 'one-drone.com'], 'aero')).toBe(true)
    expect(namesMatch(['Smart Aid Technologies'], 'smart tech')).toBe(true)
    expect(namesMatch(['Smart Aid Technologies'], 'smart zzz')).toBe(false)
    expect(namesMatch(['Aerobot'], '  ')).toBe(false)
  })
})

describe('derived sets', () => {
  test('ventures leave out a bare shared name; names and website states are read; decisions win', () => {
    const db = database()
    reading(db, 'relation:a|b', 'relation', 'a|b', { relation: 'sibling', shared: 1, similarity: null }, 'relation.shared-founders')
    reading(db, 'relation:c|d', 'relation', 'c|d', { relation: 'sibling', shared: 1, similarity: null }, 'relation.one-founder-only', 'inferred')
    reading(db, 'alias:c:0', 'alias', 'c', { name: 'Aerobot', source: 'description' }, 'alias.description')
    db.run("INSERT INTO website_checks (startup_id, url, status, detail, checked_at, since, state) VALUES ('a', 'u', 'reachable', 'd', 'c', 's', 'answers')")
    reading(db, 'website:a', 'website', 'a', { state: 'answers' }, 'website.answers')
    db.run("INSERT INTO decisions (reading_id, basis, value, decided_at) VALUES ('website:a', 'b1', '{\"state\":\"moved\"}', '2026-11-18')")
    const s = derivedSets(db)
    expect(s.names.get('c')).toEqual(['Aerobot'])
    expect(s.site.get('a')).toBe('moved')
    expect(s.founders.has('d')).toBe(false)
    expect(s.founders.has('a') || s.founders.has('b')).toBe(true)
  })
})

describe('unconfirmedKeys', () => {
  test('a repeated name is unconfirmed until the owner answers, and not when it is two people', () => {
    const db = database()
    db.run("UPDATE founders SET name = 'p', person_key = 'p' WHERE startup_id IN ('a', 'b')")
    db.run("UPDATE founders SET name = 'q', person_key = 'q' WHERE startup_id IN ('c', 'd')")
    expect([...unconfirmedKeys(db)].sort()).toEqual(['p', 'q'])
    reading(db, 'person:q', 'person', 'q', { same: false, startups: ['c', 'd'] }, 'person.name-only', 'inferred')
    expect([...unconfirmedKeys(db)]).toEqual(['p'])
  })
})
