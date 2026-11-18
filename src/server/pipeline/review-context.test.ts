import { Database } from 'bun:sqlite'
import { describe, expect, test } from 'bun:test'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import * as sqliteVec from 'sqlite-vec'

import { answerLabel, answersFor, personCard, reviewContext, startupCard } from './review-context'
import type { ReadingKind } from './readings'

// The evidence beside each review question, on a small hand-made registry. Run with: bun test

function database() {
  const db = new Database(':memory:', { strict: true })
  db.run('PRAGMA foreign_keys = ON')
  sqliteVec.load(db)
  const dir = join(import.meta.dir, '..', 'migrations')
  for (const file of readdirSync(dir).sort()) db.run(readFileSync(join(dir, file), 'utf8'))
  return db
}

function seed(db: Database) {
  db.run(`INSERT INTO downloads (id, url, fetched_at, last_checked_at, content_hash, byte_size, row_count)
          VALUES (1, 'https://registry.example/list', '2026-11-01T00:00:00Z', '2026-11-01T00:00:00Z', 'hash', 10, 4)`)
  for (const id of ['e-alpha', 'e-beta', 'e-gamma', 'e-delta']) db.run(`INSERT INTO entries (id, raw_json, first_download, last_download) VALUES (?, '{}', 1, 1)`, [id])

  const startup = (id: string, name: string, over: Record<string, unknown> = {}) => {
    const row = { display_name: null, description: null, sector: null, website: null, labelled: null, creation_year: null, ...over }
    db.run(
      `INSERT INTO startups (id, entry_id, name, display_name, description, sector, website, labelled, creation_year, first_download, last_download, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, '2026-11-01', '2026-11-01')`,
      [id, `e-${id.slice(2)}`, name, row.display_name, row.description, row.sector, row.website, row.labelled, row.creation_year],
    )
  }
  startup('s-alpha', 'ALPHA', { display_name: 'Alpha', description: 'Fintech app', sector: 'Fintech', website: 'https://alpha.tn', labelled: '2019-06', creation_year: 2019 })
  startup('s-beta', 'Beta', { description: 'Logistics', sector: 'Logistics', website: 'https://beta.tn', labelled: '2021-03' })
  startup('s-gamma', 'Gamma', { labelled: '2019-09', creation_year: 2019 })
  startup('s-delta', 'Delta', { labelled: '2020-02', creation_year: 2020 })

  const founder = (startupId: string, position: number, name: string, key: string, displayName: string | null = null) =>
    db.run('INSERT INTO founders (startup_id, position, name, display_name, person_key) VALUES (?, ?, ?, ?, ?)', [startupId, position, name, displayName, key])
  founder('s-alpha', 0, 'Ahmed Ben Said', 'ahmed ben said', 'Ahmed ben Saïd')
  founder('s-alpha', 1, 'Sara Trabelsi', 'sara trabelsi')
  founder('s-beta', 0, 'ahmed ben said', 'ahmed ben said')
  founder('s-beta', 1, 'Youssef Ben Ali', 'youssef ben ali')
  founder('s-gamma', 0, 'Maher Khelifi', 'khelifi maher')
  founder('s-delta', 0, 'Meher Khelifi', 'khelifi meher')

  db.run(
    `INSERT INTO website_checks (startup_id, url, status, detail, final_host, checked_at, since, state, title, summary)
     VALUES ('s-beta', 'https://beta.tn/', 'reachable', 'answered 200', 'beta-group.example', '2026-11-02', '2026-11-02', 'unrelated', 'Beta Group', 'A holding page')`,
  )

  const reading = (id: string, kind: string, subject: string, value: unknown) =>
    db.run(
      `INSERT INTO readings (id, kind, subject, value, lane, rule, why, basis) VALUES (?, ?, ?, ?, 'inferred', 'test', 'test', 'basis')`,
      [id, kind, subject, JSON.stringify(value)],
    )
  reading('person:ahmed ben said', 'person', 'ahmed ben said', { same: true, startups: ['s-alpha', 's-beta'] })
  reading('person_pair:khelifi maher|khelifi meher', 'person_pair', 'khelifi maher|khelifi meher', { same: false, keys: ['khelifi maher', 'khelifi meher'] })
  reading('relation:s-alpha|s-beta', 'relation', 's-alpha|s-beta', { relation: 'sibling', shared: ['ahmed ben said'], similarity: 0.4 })
  reading('relation:s-alpha|s-missing', 'relation', 's-alpha|s-missing', { relation: 'sibling', shared: [], similarity: 0.1 })
  reading('website:s-beta', 'website', 's-beta', { state: 'unrelated', url: 'https://beta.tn/', finalHost: 'beta-group.example', title: 'Beta Group' })
  reading('name:s-alpha', 'name', 's-alpha', { published: 'ALPHA', display: 'Alpha' })
  reading('alias:s-gamma:GAMMA', 'alias', 's-gamma', { alias: 'GAMMA' })
  reading('founder:s-delta#0', 'founder', 's-delta#0', { published: 'Meher Khelifi', read: 'Meher Khelifi' })
}

const labels = (answers: { label: string }[]) => answers.map((a) => a.label)
const values = (answers: { value: unknown }[]) => answers.map((a) => a.value)
const ids = (cards: { id: string }[]) => cards.map((c) => c.id)
const SAME_LABELS = ['Same person', 'Different people']
const SAME_VALUES = [{ same: true }, { same: false }]
const ACCEPT_VALUES = [{ accept: true }, { accept: false }]

describe('startupCard', () => {
  test('prefers the display name and keeps the published one', () => {
    const card = startupCard(database_with_seed(), 's-alpha')
    expect(card?.name).toBe('Alpha')
    expect(card?.published).toBe('ALPHA')
    expect(card?.creationYear).toBe(2019)
    expect(card?.labelled).toBe('2019-06')
    expect(card?.description).toBe('Fintech app')
    expect(card?.sector).toBe('Fintech')
    expect(card?.website).toBe('https://alpha.tn')
  })
  test('uses the name when no display name is set, and no website state when unchecked', () => {
    const card = startupCard(database_with_seed(), 's-alpha')
    expect(card?.websiteState).toBeNull()
    const beta = startupCard(database_with_seed(), 's-beta')
    expect(beta?.name).toBe('Beta')
    expect(beta?.published).toBe('Beta')
    expect(beta?.creationYear).toBeNull()
  })
  test('reads the website state from the check', () => {
    expect(startupCard(database_with_seed(), 's-beta')?.websiteState).toBe('unrelated')
  })
  test('lists founders in position order, with the display name preferred', () => {
    const card = startupCard(database_with_seed(), 's-alpha')
    expect(card?.founders).toEqual([
      { name: 'Ahmed ben Saïd', key: 'ahmed ben said' },
      { name: 'Sara Trabelsi', key: 'sara trabelsi' },
    ])
  })
  test('returns null for an unknown id', () => {
    expect(startupCard(database_with_seed(), 's-nothing')).toBeNull()
  })
})

describe('personCard', () => {
  test('lists distinct published spellings sorted, and its startups by year then id', () => {
    const person = personCard(database_with_seed(), 'ahmed ben said')
    expect(person.key).toBe('ahmed ben said')
    expect(person.names).toEqual(['Ahmed Ben Said', 'ahmed ben said'])
    expect(ids(person.startups)).toEqual(['s-alpha', 's-beta'])
  })
  test('puts unknown creation years last', () => {
    const person = personCard(database_with_seed(), 'ahmed ben said')
    expect(person.startups[1]?.creationYear).toBeNull()
  })
  test('is empty for an unknown key', () => {
    expect(personCard(database_with_seed(), 'nobody here')).toEqual({ key: 'nobody here', names: [], startups: [] })
  })
})

describe('reviewContext', () => {
  test('returns null for an unknown reading', () => {
    expect(reviewContext(database_with_seed(), 'person:nobody')).toBeNull()
  })

  test('person', () => {
    const ctx = reviewContext(database_with_seed(), 'person:ahmed ben said')
    expect(ctx?.kind).toBe('person')
    expect(ctx?.id).toBe('person:ahmed ben said')
    expect(ctx?.question).toBe('Is "Ahmed Ben Said" the same person on these 2 startups?')
    expect(labels(ctx?.answers ?? [])).toEqual(SAME_LABELS)
    expect(values(ctx?.answers ?? [])).toEqual(SAME_VALUES)
    expect(ids(ctx?.startups ?? [])).toEqual(['s-alpha', 's-beta'])
    expect(ctx?.people.map((p) => p.key)).toEqual(['ahmed ben said'])
    expect(ctx?.people[0]?.names).toEqual(['Ahmed Ben Said', 'ahmed ben said'])
    expect(ctx?.sharedKeys).toEqual(['ahmed ben said'])
  })

  test('person question says one startup or none in the plain form', () => {
    const db = database()
    seed(db)
    db.run(`INSERT INTO readings (id, kind, subject, value, lane, rule, why, basis) VALUES ('person:sara trabelsi', 'person', 'sara trabelsi', '{"same":true}', 'review', 'test', 'test', 'basis')`)
    db.run(`INSERT INTO readings (id, kind, subject, value, lane, rule, why, basis) VALUES ('person:nobody here', 'person', 'nobody here', '{"same":true}', 'review', 'test', 'test', 'basis')`)
    expect(reviewContext(db, 'person:sara trabelsi')?.question).toBe('Is "Sara Trabelsi" on this startup one person?')
    expect(reviewContext(db, 'person:nobody here')?.question).toBe('Is "nobody here" one person?')
  })

  test('answersFor gives a non-empty list for every kind', () => {
    const kinds: ReadingKind[] = ['name', 'alias', 'founder', 'person', 'person_pair', 'relation', 'website']
    for (const kind of kinds) expect(answersFor(kind).length).toBeGreaterThan(0)
  })

  test('answerLabel finds the label of an offered value and returns null for an unknown one', () => {
    expect(answerLabel('person', { same: false })).toBe('Different people')
    expect(answerLabel('website', { state: 'parked' })).toBe('The site is gone')
    expect(answerLabel('person', { same: 'maybe' })).toBeNull()
    expect(answerLabel('name', { accept: true })).toBe('Yes')
  })

  test('person_pair', () => {
    const ctx = reviewContext(database_with_seed(), 'person_pair:khelifi maher|khelifi meher')
    expect(ctx?.kind).toBe('person_pair')
    expect(ctx?.question).toBe('Are "Maher Khelifi" and "Meher Khelifi" the same person?')
    expect(labels(ctx?.answers ?? [])).toEqual(SAME_LABELS)
    expect(values(ctx?.answers ?? [])).toEqual(SAME_VALUES)
    expect(ids(ctx?.startups ?? [])).toEqual(['s-gamma', 's-delta'])
    expect(ctx?.people.map((p) => p.key)).toEqual(['khelifi maher', 'khelifi meher'])
    expect(ctx?.sharedKeys).toEqual([])
  })

  test('relation with both startups', () => {
    const ctx = reviewContext(database_with_seed(), 'relation:s-alpha|s-beta')
    expect(ctx?.kind).toBe('relation')
    expect(ctx?.question).toBe('How are Alpha and Beta related?')
    expect(labels(ctx?.answers ?? [])).toEqual(['Same venture, renamed', 'A later venture by the same people', 'A second venture alongside', 'Not related'])
    expect(values(ctx?.answers ?? [])).toEqual([{ relation: 'renamed' }, { relation: 'successor' }, { relation: 'sibling' }, { relation: 'unrelated' }])
    expect(ids(ctx?.startups ?? [])).toEqual(['s-alpha', 's-beta'])
    expect(ctx?.people).toEqual([])
    expect(ctx?.sharedKeys).toEqual(['ahmed ben said'])
  })

  test('relation with a missing startup keeps the one that exists', () => {
    const ctx = reviewContext(database_with_seed(), 'relation:s-alpha|s-missing')
    expect(ids(ctx?.startups ?? [])).toEqual(['s-alpha'])
    expect(ctx?.question).toBe('How are Alpha and s-missing related?')
    expect(ctx?.sharedKeys).toEqual([])
  })

  test('website', () => {
    const ctx = reviewContext(database_with_seed(), 'website:s-beta')
    expect(ctx?.kind).toBe('website')
    expect(ctx?.question).toBe("What does Beta's website show today?")
    expect(labels(ctx?.answers ?? [])).toEqual(['It moved here', 'The site is gone', 'It still answers'])
    expect(values(ctx?.answers ?? [])).toEqual([{ state: 'moved' }, { state: 'parked' }, { state: 'answers' }])
    expect(ids(ctx?.startups ?? [])).toEqual(['s-beta'])
    expect(ctx?.startups[0]?.websiteState).toBe('unrelated')
    expect(ctx?.people).toEqual([])
    expect(ctx?.sharedKeys).toEqual([])
  })

  test('name', () => {
    const ctx = reviewContext(database_with_seed(), 'name:s-alpha')
    expect(ctx?.kind).toBe('name')
    expect(ctx?.question).toBe('Is this the right name for ALPHA?')
    expect(labels(ctx?.answers ?? [])).toEqual(['Yes', 'No, keep the published name'])
    expect(values(ctx?.answers ?? [])).toEqual(ACCEPT_VALUES)
    expect(ids(ctx?.startups ?? [])).toEqual(['s-alpha'])
    expect(ctx?.people).toEqual([])
  })

  test('alias', () => {
    const ctx = reviewContext(database_with_seed(), 'alias:s-gamma:GAMMA')
    expect(ctx?.kind).toBe('alias')
    expect(ctx?.question).toBe('Is this the right name for Gamma?')
    expect(labels(ctx?.answers ?? [])).toEqual(['Yes', 'No, keep the published name'])
    expect(values(ctx?.answers ?? [])).toEqual(ACCEPT_VALUES)
    expect(ids(ctx?.startups ?? [])).toEqual(['s-gamma'])
  })

  test('founder splits at the last #', () => {
    const ctx = reviewContext(database_with_seed(), 'founder:s-delta#0')
    expect(ctx?.kind).toBe('founder')
    expect(ctx?.question).toBe("Is this founder's name read correctly?")
    expect(labels(ctx?.answers ?? [])).toEqual(['Yes', 'No, keep the published name'])
    expect(values(ctx?.answers ?? [])).toEqual(ACCEPT_VALUES)
    expect(ids(ctx?.startups ?? [])).toEqual(['s-delta'])
    expect(ctx?.people).toEqual([])
    expect(ctx?.sharedKeys).toEqual([])
  })

  test('every question is non-empty and no startup is null', () => {
    const db = database_with_seed()
    const readings = db.query<{ id: string }, []>('SELECT id FROM readings').all()
    expect(readings.length).toBe(8)
    for (const { id } of readings) {
      const ctx = reviewContext(db, id)
      expect(ctx?.question.length).toBeGreaterThan(0)
      expect(ctx?.startups.every((s) => s !== null)).toBe(true)
    }
  })
})

// The seeded database is built once per test file; each test reads it and writes nothing.
let cached: Database | null = null
function database_with_seed(): Database {
  if (!cached) {
    cached = database()
    seed(cached)
  }
  return cached
}
