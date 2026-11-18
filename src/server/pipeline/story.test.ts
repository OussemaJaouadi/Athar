import { Database } from 'bun:sqlite'
import { describe, expect, test } from 'bun:test'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import * as sqliteVec from 'sqlite-vec'

import { pairSubject } from './readings'
import { personStory, startupStory, storyCounts } from './story'

function database() {
  const db = new Database(':memory:', { strict: true })
  db.run('PRAGMA foreign_keys = ON')
  sqliteVec.load(db)
  const dir = join(import.meta.dir, '..', 'migrations')
  for (const file of readdirSync(dir).sort()) db.run(readFileSync(join(dir, file), 'utf8'))
  db.run("INSERT INTO downloads (id, url, fetched_at, last_checked_at, content_hash, byte_size, row_count) VALUES (1, 'u', 't', 't', 'h', 1, 1)")
  return db
}

type S = { name?: string; display?: string | null; legal?: string | null; sector?: string | null; year?: number | null; domain?: string | null; founders?: (string | [string, string | null])[] }

function startup(db: Database, id: string, s: S = {}) {
  db.run("INSERT INTO entries (id, raw_json, first_download, last_download) VALUES (?, '{}', 1, 1)", [`e-${id}`])
  db.run(
    `INSERT INTO startups (id, entry_id, name, display_name, legal_form, sector, creation_year, domain, labelled, first_download, last_download, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, '2022-05', 1, 1, 't', 't')`,
    [id, `e-${id}`, s.name ?? id, s.display ?? null, s.legal ?? null, s.sector ?? null, s.year ?? null, s.domain ?? null],
  )
  ;(s.founders ?? []).forEach((f, i) => {
    const [name, display] = typeof f === 'string' ? [f, null] : f
    db.run('INSERT INTO founders (startup_id, position, name, person_key, display_name) VALUES (?, ?, ?, ?, ?)', [id, i, name, name.toLowerCase(), display])
  })
}

function reading(db: Database, id: string, kind: string, subject: string, value: unknown, lane: string, rule: string, why = 'because') {
  db.run('INSERT INTO readings (id, kind, subject, value, lane, rule, why, basis) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [id, kind, subject, JSON.stringify(value), lane, rule, why, 'b1'])
}
const decision = (db: Database, id: string, value: unknown, note: string | null = null) =>
  db.run("INSERT INTO decisions (reading_id, basis, value, note, decided_at) VALUES (?, 'b1', ?, ?, '2026-11-18')", [id, JSON.stringify(value), note])
const relation = (db: Database, a: string, b: string, rel: string, lane: string, rule: string) =>
  reading(db, `relation:${pairSubject(a, b)}`, 'relation', pairSubject(a, b), { relation: rel, shared: 1, similarity: null }, lane, rule)
const check = (db: Database, id: string, over: Record<string, string | null> = {}) =>
  db.run(
    `INSERT INTO website_checks (startup_id, url, status, detail, final_host, checked_at, since, state, state_lane, state_why, title, summary)
     VALUES (?, 'https://x.tn', 'reachable', 'answered 200', ?, 'c', 's', ?, ?, ?, 'Title', 'Summary')`,
    [id, over.finalHost ?? null, over.state ?? 'answers', over.lane ?? 'rule', over.why ?? 'ok'],
  )

describe('startup name and other names', () => {
  test('display name stands, published kept after a no, unknown id is null', () => {
    const db = database()
    startup(db, 'a', { name: 'ACME SARL', display: 'Acme', legal: 'SARL' })
    reading(db, 'name:a', 'name', 'a', { display: 'Acme', legalForm: 'SARL', acronym: null }, 'inferred', 'name.caps', 'Published in capitals')
    const story = startupStory(db, 'a')!
    expect(story.name).toBe('Acme')
    expect(story.published).toBe('ACME SARL')
    expect(story.legalForm).toBe('SARL')
    expect(story.nameSaid).toEqual({ lane: 'inferred', why: 'Published in capitals', answered: false })
    decision(db, 'name:a', { accept: false })
    const kept = startupStory(db, 'a')!
    expect(kept.name).toBe('ACME SARL')
    expect(kept.nameSaid).toBeNull()
    expect(startupStory(db, 'nope')).toBeNull()
  })

  test('an owner yes on the name is reported as answered, in the rule lane', () => {
    const db = database()
    startup(db, 'a', { name: 'ACME' })
    reading(db, 'name:a', 'name', 'a', { display: 'Acme', legalForm: null, acronym: null }, 'inferred', 'name.caps')
    decision(db, 'name:a', { accept: true }, 'checked the logo')
    const story = startupStory(db, 'a')!
    expect(story.name).toBe('Acme')
    expect(story.nameSaid).toEqual({ lane: 'rule', why: 'checked the logo', answered: true })
  })

  test('other names carry their source and lane; a declined one is dropped', () => {
    const db = database()
    startup(db, 'a', { name: 'Acme' })
    reading(db, 'alias:a:ac', 'alias', 'a', { name: 'AC', source: 'name' }, 'rule', 'alias.name-acronym')
    reading(db, 'alias:a:zed', 'alias', 'a', { name: 'Zed', source: 'description' }, 'inferred', 'alias.described-as', 'opens with Zed')
    reading(db, 'alias:a:acme-tn', 'alias', 'a', { name: 'acme.tn', source: 'email' }, 'inferred', 'alias.email-only')
    const story = startupStory(db, 'a')!
    expect(story.otherNames.map((n) => [n.name, n.from, n.said.lane])).toEqual([
      ['AC', 'acronym', 'rule'],
      ['Zed', 'description', 'inferred'],
      ['acme.tn', 'email', 'inferred'],
    ])
    expect(story.otherNames[1]!.said.why).toBe('opens with Zed')
    decision(db, 'alias:a:zed', { accept: false })
    expect(startupStory(db, 'a')!.otherNames.map((n) => n.name)).toEqual(['AC', 'acme.tn'])
    expect(storyCounts(db).otherNames).toBe(2)
  })

  test('notes are returned in order, with their fields', () => {
    const db = database()
    startup(db, 'a')
    db.run("INSERT INTO startup_notes (id, startup_id, kind, text, source, on_date, created_at) VALUES ('n2', 'a', 'closed', 'Closed in 2024', 'press', '2024-03', '2026-02-01')")
    db.run("INSERT INTO startup_notes (id, startup_id, kind, text, created_at) VALUES ('n1', 'a', 'note', 'Hello', '2026-01-01')")
    const notes = startupStory(db, 'a')!.notes
    expect(notes.map((n) => n.id)).toEqual(['n1', 'n2'])
    expect(notes[1]).toEqual({ id: 'n2', kind: 'closed', text: 'Closed in 2024', source: 'press', onDate: '2024-03', createdAt: '2026-02-01' })
    expect(notes[0]!.source).toBeNull()
    expect(notes[0]!.onDate).toBeNull()
  })
})

describe('website', () => {
  test('state comes from the check, overridden by a decision', () => {
    const db = database()
    startup(db, 'a')
    check(db, 'a', { state: 'moved', lane: 'review', why: 'answers from other.tn', finalHost: 'other.tn' })
    reading(db, 'website:a', 'website', 'a', { state: 'moved', url: 'https://x.tn', finalHost: 'other.tn', title: 'Title' }, 'review', 'website.moved')
    const w = startupStory(db, 'a')!.website!
    expect(w.state).toBe('moved')
    expect(w.said).toEqual({ lane: 'review', why: 'answers from other.tn', answered: false })
    expect(w.finalHost).toBe('other.tn')
    expect(w.title).toBe('Title')
    expect(w.summary).toBe('Summary')
    expect(w.checkedAt).toBe('c')
    expect(w.since).toBe('s')
    decision(db, 'website:a', { state: 'answers' })
    const decided = startupStory(db, 'a')!.website!
    expect(decided.state).toBe('answers')
    expect(decided.said.answered).toBe(true)
    expect(decided.said.lane).toBe('rule')
  })

  test('no check means no website; a plain check is a rule', () => {
    const db = database()
    startup(db, 'a')
    startup(db, 'b')
    check(db, 'b')
    expect(startupStory(db, 'a')!.website).toBeNull()
    expect(startupStory(db, 'b')!.website).toMatchObject({ state: 'answers', said: { lane: 'rule', answered: false } })
  })
})

describe('ventures', () => {
  function team(db: Database) {
    startup(db, 'main', { name: 'Main', year: 2020, sector: 'Fintech', domain: 'main.tn', founders: ['Ali One', 'Sara Two', 'Omar Three'] })
    startup(db, 'sib', { name: 'Sib', year: 2020, sector: 'Health', founders: ['Ali One', 'Sara Two', 'Omar Three'] })
    startup(db, 'succ', { name: 'Succ', year: 2022, sector: 'Fintech', founders: ['Ali One', 'Sara Two', 'Omar Three'] })
    startup(db, 'ren', { name: 'Ren', year: 2019, sector: 'Fintech', domain: 'main.tn', founders: ['Ali One', 'Sara Two'] })
    relation(db, 'main', 'sib', 'sibling', 'inferred', 'relation.same-team')
    relation(db, 'main', 'succ', 'successor', 'inferred', 'relation.later-same-field')
    relation(db, 'main', 'ren', 'renamed', 'rule', 'relation.same-site')
  }

  test('order is renamed, successor, sibling; sentences say the facts', () => {
    const db = database()
    team(db)
    const v = startupStory(db, 'main')!.ventures
    expect(v.map((x) => [x.startup.id, x.relation])).toEqual([['ren', 'renamed'], ['succ', 'successor'], ['sib', 'sibling']])
    expect(v[1]!.sentence).toBe('Founded two years later by the same three people. The later one may have replaced the earlier.')
    expect(v[2]!.sentence).toBe('Founded the same year by the same three people. Likely a second venture alongside.')
    expect(v[0]!.sentence).toContain('Founded one year earlier')
    expect(v[0]!.sentence).toContain('two founders in common')
    expect(v[0]!.sentence).toContain('Both list the website main.tn')
    expect(v[0]!.sharedFounders).toEqual(['Ali One', 'Sara Two'])
    expect(v[1]!.sharedFounders).toEqual(['Ali One', 'Sara Two', 'Omar Three'])
    expect(v[2]!.said).toEqual({ lane: 'inferred', why: 'because', answered: false })
    expect(v.every((x) => !x.nameOnly)).toBe(true)
    expect(v[1]!.startup).toEqual({ id: 'succ', name: 'Succ', sector: 'Fintech', creationYear: 2022, labelled: '2022-05' })
  })

  test('the tie reads from the other side too', () => {
    const db = database()
    team(db)
    const v = startupStory(db, 'succ')!.ventures
    expect(v).toHaveLength(1)
    expect(v[0]!.startup.id).toBe('main')
    expect(v[0]!.sentence).toContain('Founded two years earlier')
  })

  test('within a relation: by year, then name', () => {
    const db = database()
    startup(db, 'm', { year: 2020, founders: ['A B', 'C D'] })
    startup(db, 'z', { name: 'Zed', year: 2021, founders: ['A B', 'C D'] })
    startup(db, 'y', { name: 'Yak', year: 2021, founders: ['A B', 'C D'] })
    startup(db, 'x', { name: 'Xu', year: 2018, founders: ['A B', 'C D'] })
    for (const o of ['z', 'y', 'x']) relation(db, 'm', o, 'sibling', 'inferred', 'relation.several-founders')
    expect(startupStory(db, 'm')!.ventures.map((x) => x.startup.name)).toEqual(['Xu', 'Yak', 'Zed'])
  })

  test('a display name is used for the other startup and for founders; a declined one is not', () => {
    const db = database()
    startup(db, 'm', { year: 2020, founders: [['ALI ONE', 'Ali One'], 'Sara Two'] })
    startup(db, 'o', { name: 'OTHER', display: 'Other', year: 2021, founders: ['ALI ONE', 'Sara Two'] })
    reading(db, 'name:o', 'name', 'o', { display: 'Other', legalForm: null, acronym: null }, 'inferred', 'name.caps')
    reading(db, 'founder:m#0', 'founder', 'm#0', { display: 'Ali One' }, 'rule', 'person.casing')
    relation(db, 'm', 'o', 'sibling', 'inferred', 'relation.several-founders')
    let v = startupStory(db, 'm')!.ventures[0]!
    expect(v.startup.name).toBe('Other')
    expect(v.sharedFounders).toEqual(['Ali One', 'Sara Two'])
    decision(db, 'name:o', { accept: false })
    decision(db, 'founder:m#0', { accept: false })
    v = startupStory(db, 'm')!.ventures[0]!
    expect(v.startup.name).toBe('OTHER')
    expect(v.sharedFounders).toEqual(['ALI ONE', 'Sara Two'])
  })
})

describe('name-only ties', () => {
  function namesake(db: Database) {
    startup(db, 'a', { year: 2020, sector: 'X', founders: ['Mehdi Ben Salah'] })
    startup(db, 'b', { name: 'Bee', year: 2021, sector: 'Y', founders: ['Mehdi Ben Salah'] })
    relation(db, 'a', 'b', 'unrelated', 'review', 'relation.one-founder-only')
    reading(db, 'person:mehdi ben salah', 'person', 'mehdi ben salah', { same: true, startups: ['a', 'b'] }, 'review', 'person.short-name-only')
  }

  test('included, flagged, with the not-confirmed sentence; last in order', () => {
    const db = database()
    namesake(db)
    startup(db, 'c', { name: 'Cee', year: 2025, founders: ['Mehdi Ben Salah', 'Lina K'] })
    startup(db, 'd', { name: 'Dee', year: 2025, founders: ['Lina K', 'Mehdi Ben Salah'] })
    relation(db, 'a', 'c', 'sibling', 'inferred', 'relation.several-founders')
    const v = startupStory(db, 'a')!.ventures
    expect(v.map((x) => x.startup.id)).toEqual(['c', 'b'])
    const tie = v[1]!
    expect(tie.nameOnly).toBe(true)
    expect(tie.relation).toBe('unrelated')
    expect(tie.sentence).toBe('Lists a founder named Mehdi Ben Salah, as this startup does; whether it is the same person is not confirmed.')
    expect(tie.sharedFounders).toEqual(['Mehdi Ben Salah'])
    expect(tie.said.lane).toBe('review')
    expect(storyCounts(db).nameOnly).toBe(1)
  })

  test('left out once the person is answered "different people"', () => {
    const db = database()
    namesake(db)
    decision(db, 'person:mehdi ben salah', { same: false })
    expect(startupStory(db, 'a')!.ventures).toEqual([])
    expect(startupStory(db, 'b')!.ventures).toEqual([])
    expect(storyCounts(db)).toMatchObject({ nameOnly: 0, siblings: 0, renamed: 0, successors: 0 })
  })

  test('becomes a real relation once the owner answers the relation', () => {
    const db = database()
    namesake(db)
    decision(db, 'relation:a|b', { relation: 'sibling' })
    const v = startupStory(db, 'a')!.ventures
    expect(v).toHaveLength(1)
    expect(v[0]!.relation).toBe('sibling')
    expect(v[0]!.nameOnly).toBe(false)
    expect(v[0]!.said).toMatchObject({ lane: 'rule', answered: true })
    expect(v[0]!.sentence).toBe('Founded one year later, with one founder in common. A second venture alongside.')
    expect(storyCounts(db)).toMatchObject({ siblings: 1, nameOnly: 0 })
  })

  test('an owner answer of "not related" leaves the tie out', () => {
    const db = database()
    namesake(db)
    decision(db, 'relation:a|b', { relation: 'unrelated' })
    expect(startupStory(db, 'a')!.ventures).toEqual([])
  })

  test('a person confirmed the same keeps the open tie, no longer name-only', () => {
    const db = database()
    namesake(db)
    decision(db, 'person:mehdi ben salah', { same: true })
    const v = startupStory(db, 'a')!.ventures
    expect(v).toHaveLength(1)
    expect(v[0]!.nameOnly).toBe(false)
    expect(v[0]!.sentence).toContain('not confirmed')
  })
})

describe('personStory', () => {
  function seed(db: Database) {
    startup(db, 'late', { name: 'Late', year: 2023, sector: 'S', founders: ['SAMI TRABELSI', 'Nour A'] })
    startup(db, 'early', { name: 'Early', year: 2019, sector: 'T', founders: ['Sami Trabelsi'] })
    startup(db, 'mid', { name: 'Mid', year: 2021, founders: [['sami trabelsi', 'Sami Trabelsi'], 'Rim B'] })
    startup(db, 'solo', { name: 'Solo', year: 2020, founders: ['Lone Wolf'] })
  }

  test('unknown key is null; spellings, most used name, order by year, co-founders', () => {
    const db = database()
    seed(db)
    expect(personStory(db, 'nobody')).toBeNull()
    const p = personStory(db, 'sami trabelsi')!
    expect(p.name).toBe('Sami Trabelsi')
    expect([...p.spellings].sort()).toEqual(['SAMI TRABELSI', 'Sami Trabelsi', 'sami trabelsi'])
    expect(p.spellings).toHaveLength(3)
    expect(p.startups.map((s) => s.id)).toEqual(['early', 'mid', 'late'])
    expect(p.startups.map((s) => s.coFounders)).toEqual([[], ['Rim B'], ['Nour A']])
    expect(p.startups[0]).toMatchObject({ name: 'Early', creationYear: 2019, labelled: '2022-05' })
  })

  test('onePerson: null on a single startup; rule; review; answered different', () => {
    const db = database()
    seed(db)
    expect(personStory(db, 'lone wolf')!.onePerson).toBeNull()
    reading(db, 'person:sami trabelsi', 'person', 'sami trabelsi', { same: true, startups: ['early', 'late', 'mid'] }, 'rule', 'person.corroborated', 'same co-founder')
    expect(personStory(db, 'sami trabelsi')!.onePerson).toEqual({ same: true, said: { lane: 'rule', why: 'same co-founder', answered: false } })
    db.run("UPDATE readings SET lane = 'review', rule = 'person.short-name-only', why = 'may be two' WHERE id = 'person:sami trabelsi'")
    expect(personStory(db, 'sami trabelsi')!.onePerson).toEqual({ same: true, said: { lane: 'review', why: 'may be two', answered: false } })
    decision(db, 'person:sami trabelsi', { same: false })
    const p = personStory(db, 'sami trabelsi')!
    expect(p.onePerson).toMatchObject({ same: false, said: { lane: 'rule', answered: true } })
    expect(p.startups).toHaveLength(3)
  })

  test('look-alikes come from pair readings; a "different people" answer removes them', () => {
    const db = database()
    seed(db)
    startup(db, 'x', { name: 'X', founders: ['Sami Trabelsi Jr'] })
    startup(db, 'y', { name: 'Y', founders: ['Sami Trabelsy'] })
    reading(db, 'person_pair:p1', 'person_pair', pairSubject('sami trabelsi', 'sami trabelsi jr'), { same: false, keys: [] }, 'review', 'person.name-contained', 'contained')
    reading(db, 'person_pair:p2', 'person_pair', pairSubject('sami trabelsi', 'sami trabelsy'), { same: true, keys: [] }, 'inferred', 'person.near-and-linked', 'linked')
    reading(db, 'person_pair:p3', 'person_pair', pairSubject('lone wolf', 'sami trabelsy'), { same: false, keys: [] }, 'review', 'person.one-letter-apart')
    let look = personStory(db, 'sami trabelsi')!.lookAlikes
    expect(look.map((l) => [l.key, l.name, l.same, l.said.lane])).toEqual([
      ['sami trabelsi jr', 'Sami Trabelsi Jr', false, 'review'],
      ['sami trabelsy', 'Sami Trabelsy', true, 'inferred'],
    ])
    expect(personStory(db, 'sami trabelsy')!.lookAlikes.map((l) => l.key).sort()).toEqual(['lone wolf', 'sami trabelsi'])
    decision(db, 'person_pair:p1', { same: false })
    look = personStory(db, 'sami trabelsi')!.lookAlikes
    expect(look.map((l) => l.key)).toEqual(['sami trabelsy'])
    db.run("UPDATE readings SET lane = 'rule' WHERE id = 'person_pair:p3'")
    expect(personStory(db, 'lone wolf')!.lookAlikes).toEqual([])
  })
})

describe('storyCounts', () => {
  test('counts pairs once, by effective value, and moved or gone websites', () => {
    const db = database()
    for (const id of ['a', 'b', 'c', 'd', 'e']) startup(db, id, { founders: ['P Q', 'R S'] })
    relation(db, 'a', 'b', 'renamed', 'inferred', 'relation.alias')
    relation(db, 'a', 'c', 'successor', 'inferred', 'relation.later-same-field')
    relation(db, 'a', 'd', 'sibling', 'inferred', 'relation.same-team')
    relation(db, 'b', 'e', 'sibling', 'inferred', 'relation.same-team')
    decision(db, 'relation:b|e', { relation: 'renamed' })
    check(db, 'a', { state: 'moved' })
    check(db, 'b', { state: 'parked' })
    check(db, 'c', { state: 'answers' })
    check(db, 'd', { state: 'parked' })
    reading(db, 'website:d', 'website', 'd', { state: 'parked' }, 'inferred', 'website.parked')
    decision(db, 'website:d', { state: 'answers' })
    expect(storyCounts(db)).toEqual({ renamed: 2, successors: 1, siblings: 1, nameOnly: 0, otherNames: 0, movedOrGone: 2 })
  })
})
