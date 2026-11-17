import { Database } from 'bun:sqlite'
import { describe, expect, test } from 'bun:test'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import * as sqliteVec from 'sqlite-vec'

import { build, slug } from './build'
import { cleanEntry, detectLanguage, displayRow, nameKey, parseWebsite, personKey } from './clean'
import { entryId, ingest } from './collect'
import type { RegistryRow } from './registry'

// The rules of the pipeline, pinned to the cases found in the real registry on 17 Nov 2026.
// Run with: bun test

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
const run = (db: Database) => build.run({ db, runId: 'test' }) as { itemsOut: number; message: string }
const startups = (db: Database) => db.query<{ id: string; name: string; sector: string | null; description: string | null }, []>('SELECT id, name, sector, description FROM startups ORDER BY id').all()

describe('website', () => {
  test('keeps an address as published, lower-cased host, no trailing slash', () => {
    expect(parseWebsite('https://www.PackageCenter.com/')).toMatchObject({ website: 'https://www.packagecenter.com', domain: 'packagecenter.com', kind: 'own' })
    expect(parseWebsite('www.atome.tn').website).toBe('https://www.atome.tn')
  })
  test('reads nothing from an empty field', () => {
    for (const empty of [null, '', '  ', 'n.a.', 'N.A', '#']) expect(parseWebsite(empty)).toMatchObject({ website: null, unreadable: false })
  })
  test('repairs typing errors that have one reading', () => {
    expect(parseWebsite('http::/www.wemove.tn')).toMatchObject({ website: 'http://www.wemove.tn', repaired: true })
    expect(parseWebsite('http:// www.thefenix.io').website).toBe('http://www.thefenix.io')
    expect(parseWebsite('htp://mve.tn').website).toBe('http://mve.tn')
    expect(parseWebsite('www..alidade.tn').website).toBe('https://www.alidade.tn')
  })
  test('keeps only the address when the field carries login details', () => {
    const site = parseWebsite('https://tanitai.azurewebsites.net/   Mail: someone@example.com Pswd: Secret@2023')
    expect(site).toMatchObject({ website: 'https://tanitai.azurewebsites.net', extraText: true, others: [] })
  })
  test('keeps the first of two addresses and names the second', () => {
    expect(parseWebsite('www.tissu.tn | www.mercerie.tn')).toMatchObject({ website: 'https://www.tissu.tn', others: ['https://www.mercerie.tn'], extraText: false })
    expect(parseWebsite('https://app.dentameet.tn/ et https://dentameet.tn/')).toMatchObject({ website: 'https://app.dentameet.tn', extraText: false })
  })
  test('identifies a page on a shared host by its path, not by the host', () => {
    expect(parseWebsite('https://sites.google.com/view/flexiolar/')).toMatchObject({ domain: 'sites.google.com/view/flexiolar', kind: 'hosted' })
    expect(parseWebsite('https://www.facebook.com/urbangreen.tn')).toMatchObject({ domain: 'facebook.com/urbangreen.tn', kind: 'social' })
    expect(parseWebsite('https://facebook.com').domain).toBeNull()
    expect(parseWebsite('https://bit.ly/38vVraq').kind).toBe('shortlink')
    expect(parseWebsite('https://barkallaholfaa.wixsite.com/website')).toMatchObject({ domain: 'barkallaholfaa.wixsite.com', kind: 'hosted' })
  })
})

describe('names and people', () => {
  test('a legal form, case, accents and punctuation do not make a different company', () => {
    expect(nameKey('BSmart SARL')).toBe(nameKey('bsmart'))
    expect(nameKey('Bridges S.A')).toBe('bridges')
    expect(nameKey('Mon Ingénieur Express')).toBe('moningenieurexpress')
    expect(nameKey('Visa')).toBe('visa') // "sa" inside a word is not a legal form
  })
  test('one person under two spellings has one key', () => {
    expect(personKey('Mehdi BOUDHRAA')).toBe(personKey('Mehdi Boudhraa'))
    expect(personKey('Ben Salah Slim')).toBe(personKey('Slim Ben Salah'))
    expect(personKey('Béchir Yahia')).toBe(personKey('Bechir YAHIA'))
    expect(personKey('Mehdi Boudhraa')).not.toBe(personKey('Mehdi Boudhra'))
  })
  test('a slug is readable, stable and cut at a word', () => {
    expect(slug('Mon Ingénieur Express')).toBe('mon-ingenieur-express')
    expect(slug('Tanit.ai')).toBe('tanit-ai')
    expect(slug('Elevage des abeilles pour la collecte de leurs venins pour des fins cosmétiques et thérapeutiques')).toBe('elevage-des-abeilles-pour-la-collecte-de-leurs')
    expect(slug('***')).toBe('startup')
  })
})

describe('language', () => {
  test('tells the three languages of the registry apart', () => {
    expect(detectLanguage('Developing mobile payment solutions and online payment gateways.')).toBe('en')
    expect(detectLanguage('Une assurance affinitaire digitale qui couvre les smartphones.')).toBe('fr')
    expect(detectLanguage('Location de voitures entre particuliers')).toBe('fr')
    expect(detectLanguage('منصة لحجز مواعيد الأطباء')).toBe('ar')
  })
  test('does not guess from too little', () => {
    expect(cleanEntry(row({ desc: 'trst' })).cleaned.language).toBeNull()
    expect(cleanEntry(row({ desc: null })).cleaned.language).toBeNull()
  })
})

describe('one entry', () => {
  test('reads every used field into its type', () => {
    const { cleaned, changes, notes } = cleanEntry(row({ name: '  Relead ', desc: 'Wi-Fi &amp; adverts,\r\nfor everyone.' }))
    expect(cleaned).toMatchObject({
      name: 'Relead', description: 'Wi-Fi & adverts, for everyone.', language: 'en', sector: 'Ad Tech and Creative Tech',
      website: 'https://relead.tn', websiteKind: 'own', domain: 'relead.tn', labelled: '2022-12', creationYear: 2021,
    })
    expect(cleaned.founders).toEqual([{ name: 'Hadhami Rjiba', personKey: 'hadhami rjiba' }, { name: 'Rayen Cherni', personKey: 'cherni rayen' }])
    expect(changes).toEqual([]) // tidying spaces is not a change worth showing
    expect(notes).toEqual([])
  })
  test('says what it changed, and only that', () => {
    expect(cleanEntry(row({ website: 'http::/www.wemove.tn' })).changes).toEqual([{ field: 'website', from: 'http::/www.wemove.tn', to: 'http://www.wemove.tn', why: 'Typing error repaired' }])
    const repeated = cleanEntry(row({ founders: ['Rayen Cherni', ' ', 'Rayen CHERNI'] }))
    expect(repeated.cleaned.founders.map((f) => f.name)).toEqual(['Rayen Cherni'])
    expect(repeated.changes.map((c) => c.field)).toEqual(['founders'])
  })
  test('records what is missing or unreadable as a note, never as a decision', () => {
    expect(cleanEntry(row({ desc: null })).notes.map((n) => n.code)).toEqual(['no_description'])
    expect(cleanEntry(row({ label: 'soon' })).cleaned.labelled).toBeNull()
    expect(cleanEntry(row({ label: '13/2022' })).notes.map((n) => n.code)).toEqual(['label_unreadable'])
    expect(cleanEntry(row({ label: '01/2019', creation_year: '2021' })).notes.map((n) => n.code)).toEqual(['label_before_creation'])
  })
  test('never shows the text withheld from a website field', () => {
    const shown = displayRow(row({ website: 'https://tanitai.azurewebsites.net/   Mail: someone@example.com Pswd: Secret@2023' }))
    expect(shown.website).toBe('https://tanitai.azurewebsites.net [extra text withheld]')
    expect(JSON.stringify(shown)).not.toContain('Secret')
    const plain = row()
    expect(displayRow(plain)).toBe(plain)
  })
})

describe('collect', () => {
  test('an entry has the same id whatever the order of its keys or of the download', () => {
    const a = row()
    const reordered = Object.fromEntries(Object.entries(a).reverse())
    expect(entryId(a)).toBe(entryId(reordered))
    expect(entryId(a)).toHaveLength(12)
    expect(entryId(a)).not.toBe(entryId(row({ desc: 'Edited.' })))
  })
  test('the same rows in another order are not a new download', () => {
    const db = database()
    const rows = [row(), row({ name: 'Paymee', website: 'https://paymee.tn' }), row({ name: 'Paymee', website: 'https://paymee.tn' })]
    expect(ingest(db, body(rows), null).message).toBe('3 rows; 2 distinct entries stored')
    expect(ingest(db, body([...rows].reverse()), null).itemsOut).toBe(0)
    expect(db.query<{ n: number }, []>('SELECT COUNT(*) AS n FROM downloads').get()?.n).toBe(1)
    expect(db.query<{ copies: number }, []>("SELECT copies FROM entries WHERE raw_json LIKE '%Paymee%'").get()?.copies).toBe(2)
  })
  test('refuses a download that lost a used field, a name, or most of its rows', () => {
    const db = database()
    const { desc: _desc, ...withoutDesc } = row()
    expect(() => ingest(db, body([withoutDesc as RegistryRow]), null)).toThrow('no longer publishes the field "desc"')
    expect(() => ingest(db, body([row({ name: ' ' })]), null)).toThrow('has no name')
    expect(() => ingest(db, new TextEncoder().encode('{}'), null)).toThrow('not a list')
    ingest(db, body(Array.from({ length: 10 }, (_, i) => row({ name: `Startup ${i}`, website: `https://s${i}.tn` }))), null)
    expect(() => ingest(db, body([row()]), null)).toThrow('Refused')
  })
})

describe('build', () => {
  const listed = (rows: RegistryRow[]) => {
    const db = database()
    ingest(db, body(rows), null)
    run(db)
    return db
  }
  test('two listings of one company become one startup, led by the fuller one', () => {
    const db = listed([
      row({ name: 'Kinko', website: 'https://kinkobooking.com/', sector: 'Commerce and shopping', desc: 'Short.' }),
      row({ name: 'Kinko', website: 'https://kinkobooking.com/', sector: 'TravelTech', desc: 'A much longer description of a booking platform.' }),
    ])
    expect(startups(db)).toEqual([{ id: 'kinko', name: 'Kinko', sector: 'TravelTech', description: 'A much longer description of a booking platform.' }])
    const notes = JSON.parse(db.query<{ notes_json: string }, []>('SELECT notes_json FROM startups').get()!.notes_json) as { code: string }[]
    expect(notes.map((n) => n.code).sort()).toEqual(['listed_more_than_once', 'other_sector'])
  })
  test('the same website under two names is one startup; the same name with no website is one startup', () => {
    expect(startups(listed([row({ name: 'Atome Academy', website: 'www.atome.tn' }), row({ name: 'Atome Edtech', website: 'www.atome.tn', desc: 'Longer description here.' })]))).toHaveLength(1)
    expect(startups(listed([row({ name: 'Gloristory', website: null }), row({ name: 'Gloristory', website: null, desc: null })]))).toHaveLength(1)
  })
  test('three companies on one shared host stay three startups', () => {
    const db = listed([
      row({ name: 'Meditech', website: 'https://sites.google.com/view/anath-health-care', founders: ['A One'] }),
      row({ name: 'Flexiolar', website: 'https://sites.google.com/view/flexiolar/', founders: ['B Two'] }),
      row({ name: 'Bartita', website: 'https://sites.google.com/view/kidzoolink', founders: ['C Three'] }),
    ])
    expect(startups(db).map((s) => s.id)).toEqual(['bartita', 'flexiolar', 'meditech'])
  })
  test('two companies that share only a name stay apart; a shared founder joins them', () => {
    const apart = [row({ name: 'Nova', website: 'https://nova.tn', founders: ['A One'] }), row({ name: 'Nova', website: 'https://nova.io', founders: ['B Two'] })]
    expect(startups(listed(apart))).toHaveLength(2)
    const joined = [row({ name: 'Nova', website: 'https://nova.tn', founders: ['A One'] }), row({ name: 'Nova', website: 'https://nova.io', founders: ['a ONE', 'B Two'] })]
    expect(startups(listed(joined))).toHaveLength(1)
  })
  test('a startup keeps its id when the registry edits it, renames it or moves its website', () => {
    const db = listed([row(), row({ name: 'Paymee', website: 'https://paymee.tn' })])
    ingest(db, body([row({ desc: 'Edited description.', name: 'Relead Tunisie' }), row({ name: 'Paymee', website: 'https://paymee.com' })]), null)
    expect(run(db).message).toBe('2 startups from 4 entries; 0 new, 2 changed, 0 unchanged')
    expect(startups(db).map((s) => [s.id, s.name, s.description])).toEqual([['paymee', 'Paymee', 'Free Wi-Fi paid by an 8-second advert.'], ['relead', 'Relead Tunisie', 'Edited description.']])
  })
  test('a startup the registry stops publishing is kept, with the download it was last in', () => {
    const many = Array.from({ length: 4 }, (_, i) => row({ name: `Startup ${i}`, website: `https://s${i}.tn`, founders: [`Founder ${i}`] }))
    const db = listed(many)
    ingest(db, body(many.slice(1)), null)
    run(db)
    expect(db.query<{ id: string }, []>('SELECT id FROM startups WHERE last_download < (SELECT MAX(id) FROM downloads)').all()).toEqual([{ id: 'startup-0' }])
    expect(startups(db)).toHaveLength(4)
  })
  test('building twice changes nothing', () => {
    const db = listed([row(), row({ name: 'Paymee', website: 'https://paymee.tn' })])
    const before = db.query('SELECT * FROM startups ORDER BY id').all()
    expect(run(db).message).toBe('2 startups from 2 entries; 0 new, 0 changed, 2 unchanged')
    expect(db.query('SELECT * FROM startups ORDER BY id').all()).toEqual(before)
    expect(db.query<{ n: number }, []>('SELECT COUNT(*) AS n FROM founders').get()?.n).toBe(4)
  })
})
