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

describe('state of the pipeline', () => {
  const { pipelineState, entryView, findEntries } = require('./state') as typeof import('./state')
  const by = (db: Database) => Object.fromEntries(pipelineState(db).steps.map((s) => [s.operation, s]))

  test('says what was never run, and stops asking once it is done', () => {
    const db = database()
    expect(by(db).collect.next).toBe('Run Collect to download the registry.')
    ingest(db, body([row(), row({ name: 'Paymee', website: 'https://paymee.tn', desc: null })]), null)
    expect(by(db).rebuild).toMatchObject({ state: 'never_run', missing: 2 })
    run(db)
    const s = by(db)
    expect(s.rebuild).toMatchObject({ state: 'up_to_date', current: 2, next: null })
    expect(s.collect).toMatchObject({ state: 'up_to_date', total: 2, current: 2 })
    expect(s.collect.counts).toMatch(/Last compared with the registry on \d{1,2} [A-Z][a-z]{2} \d{4}\./)
    expect(s.check).toMatchObject({ state: 'never_run', total: 2, missing: 2 })
    expect(s.embed).toMatchObject({ state: 'never_run', total: 1, missing: 1 }) // Paymee has no description
    expect(s.prepare).toMatchObject({ state: 'not_configured', next: null }) // no key: nothing is asked of the operator
    expect(pipelineState(db).upToDate).toBe(false)
  })

  test('a website that changed in the registry makes its check out of date', () => {
    const db = database()
    ingest(db, body([row()]), null)
    run(db)
    db.query("INSERT INTO website_checks (startup_id, url, status, detail, checked_at, since) VALUES ('relead', 'https://relead.tn', 'reachable', 'answered 200', '2026-11-17T00:00:00Z', '2026-11-17T00:00:00Z')").run()
    expect(by(db).check).toMatchObject({ state: 'up_to_date', next: null })
    ingest(db, body([row({ website: 'https://relead.io' })]), null)
    run(db)
    expect(by(db).check).toMatchObject({ state: 'stale', outOfDate: 1 })
    expect(by(db).check.reasons[0]).toContain('new address')
  })

  test('startups built with older rules are due a rebuild', () => {
    const db = database()
    ingest(db, body([row()]), null)
    run(db)
    db.run("UPDATE pipeline_meta SET value = 'rules-0' WHERE key = 'rules'")
    expect(by(db).rebuild).toMatchObject({ state: 'stale', outOfDate: 1 })
    run(db)
    expect(by(db).rebuild.state).toBe('up_to_date')
  })

  test('an entry says why it belongs to its startup and what it read differently', () => {
    const db = database()
    const used = row({ name: 'Kinko', website: 'https://kinkobooking.com/', sector: 'TravelTech', desc: 'A much longer description of a booking platform.' })
    const unused = row({ name: 'Kinko', website: 'https://kinkobooking.com/', sector: 'Commerce and shopping', desc: 'Short.' })
    ingest(db, body([used, unused, row({ name: 'Nova', website: 'https://nova.tn', founders: ['A One'] }), row({ name: 'Nova', website: 'https://nova.io', founders: ['B Two'] })]), null)
    run(db)
    const view = entryView(db, entryId(unused))!
    expect(view).toMatchObject({ lead: false, published: true, startup: { id: 'kinko' } })
    expect(view.siblings).toHaveLength(1)
    expect(view.siblings[0].lead).toBe(true)
    expect(view.siblings[0].bonds.map((b) => b.kind)).toEqual(['website', 'name', 'founder'])
    expect(view.siblings[0].differences.map((d) => d.field)).toEqual(['description', 'sector'])
    const nova = entryView(db, entryId(row({ name: 'Nova', website: 'https://nova.tn', founders: ['A One'] })))!
    expect(nova.namesakes).toHaveLength(1)
    expect(nova.namesakes[0].why).toContain('nova.io')
    expect(entryView(db, 'ffffffffffff')).toBeNull()
  })

  test('an entry is found by its id, by a word, or by the website, and never shows withheld text', () => {
    const db = database()
    const secret = row({ name: 'Tanit.ai', website: 'https://tanitai.azurewebsites.net/   Mail: someone@example.com Pswd: Secret@2023', desc: null })
    ingest(db, body([row(), secret]), null)
    run(db)
    const id = entryId(secret)
    expect(findEntries(db, id.slice(0, 6)).map((e) => e.id)).toEqual([id])
    expect(findEntries(db, 'tanit').map((e) => e.startupId)).toEqual(['tanit-ai'])
    expect(findEntries(db, 'relead.tn').map((e) => e.startupId)).toEqual(['relead'])
    expect(findEntries(db, 'tanit-ai').map((e) => e.id)).toEqual([id])
    expect((require('./state') as typeof import('./state')).leadEntry(db, 'tanit-ai')).toBe(id)
    expect((require('./state') as typeof import('./state')).leadEntry(db, 'nobody')).toBeNull()
    expect(JSON.stringify(entryView(db, id))).not.toContain('Secret')
  })
})

describe('the rows behind the numbers', () => {
  const { factRows, downloads, downloadChanges, people, ideaChecks } = require('./facts') as typeof import('./facts')

  test('a counted note opens as the startups it counts', () => {
    const db = database()
    ingest(db, body([row(), row({ name: 'Paymee', website: 'https://paymee.tn', desc: null }), row({ name: 'Urban Green', website: 'https://www.facebook.com/urbangreen.tn', founders: ['U G'] })]), null)
    run(db)
    db.query("INSERT INTO website_checks (startup_id, url, status, detail, checked_at, since) VALUES ('relead', 'https://relead.tn', 'unreachable', 'no such domain', 't', 't')").run()
    const seen = db.query<{ at: string }, []>('SELECT last_checked_at AS at FROM downloads').get()!.at
    expect(factRows(db, 'no_description')).toEqual({ rows: [{ startupId: 'paymee', name: 'Paymee', value: 'The registry publishes no description', labelled: '2022-12', observedOn: seen }], total: 1 })
    // a website fact is dated by its check, not by the download
    expect(factRows(db, 'unreachable:no such domain')?.rows).toEqual([{ startupId: 'relead', name: 'Relead', value: 'https://relead.tn · no such domain', labelled: '2022-12', observedOn: 't' }])
    expect(factRows(db, 'social_not_checked')?.rows.map((r) => r.startupId)).toEqual(['urban-green'])
    expect(factRows(db, 'startups_unchanged')).toBeNull()
    const { qualitySummary, searchStartups } = require('./facts') as typeof import('./facts')
    const q = Object.fromEntries(qualitySummary(db).map((f) => [f.code, f]))
    expect(q.no_description).toMatchObject({ group: 'missing', count: 1 })
    expect(q['unreachable:no such domain']).toEqual({ code: 'unreachable:no such domain', group: 'website', label: 'Website does not answer: the domain no longer exists', count: 1 })
    expect(q.social_not_checked.count).toBe(1)
    expect(q.other_sector.count).toBe(0) // none is said, not left out
    for (const f of qualitySummary(db)) expect(factRows(db, f.code)?.total).toBe(f.count)
    expect(searchStartups(db, 'paymee')).toEqual([{ id: 'paymee', name: 'Paymee', sector: 'Ad Tech and Creative Tech', entries: 1, notes: ['no_description'], withdrawn: false }])
    expect(searchStartups(db, 'facebook.com').map((x) => x.id)).toEqual(['urban-green'])
    expect(searchStartups(db, entryId(row()).slice(0, 5)).map((x) => x.id)).toEqual(['relead'])
    expect(searchStartups(db, '  ')).toEqual([])
  })

  test('a download says what it added, what was edited and what was withdrawn', () => {
    const db = database()
    const first = Array.from({ length: 4 }, (_, i) => row({ name: `Startup ${i}`, website: `https://s${i}.tn`, founders: [`Founder ${i}`] }))
    ingest(db, body(first), null)
    run(db)
    ingest(db, body([first[1], { ...first[2], desc: 'Edited.' }, first[3], row({ name: 'Newcomer', website: 'https://new.tn', founders: ['N C'] })]), null)
    run(db)
    expect(downloads(db).map((d) => [d.id, d.entriesNew, d.entriesGone, d.startupsNew, d.startupsGone, d.startupsEdited])).toEqual([[2, 2, 2, 1, 1, 1], [1, 4, 0, 4, 0, 0]])
    expect(downloadChanges(db, 2)!.map((c) => [c.name, c.kind]).sort()).toEqual([['Newcomer', 'new startup'], ['Startup 0', 'startup withdrawn'], ['Startup 2', 'edited']])
    const edited = downloadChanges(db, 2)!.find((c) => c.kind === 'edited')!
    expect(edited).toMatchObject({ startupId: 'startup-2', sector: 'Ad Tech and Creative Tech', labelled: '2022-12' })
    expect(edited.differences).toEqual([{ field: 'description', before: 'Free Wi-Fi paid by an 8-second advert.', after: 'Edited.' }])
    expect(downloadChanges(db, 2)!.find((c) => c.kind === 'new startup')!.differences).toBeUndefined()
    expect(downloadChanges(db, 9)).toBeNull()
  })

  test('people are counted once whatever the spelling, and found by any of them', () => {
    const db = database()
    ingest(db, body([row(), row({ name: 'RGPD Tunisie', website: 'https://rgpd-tunisie.tn', founders: ['Rayen CHERNI', 'Slim Abdeljelil'] })]), null)
    run(db)
    expect(people(db).total).toBe(3)
    const repeat = people(db, { repeat: true })
    expect(repeat.rows).toHaveLength(1)
    expect(repeat.rows[0]).toMatchObject({ slug: 'cherni-rayen', name: 'Rayen Cherni', spellings: ['Rayen CHERNI'] })
    expect(repeat.rows[0].startups.map((s) => s.id).sort()).toEqual(['relead', 'rgpd-tunisie'])
    expect(people(db, { q: 'CHERNI' }).rows.map((p) => p.slug)).toEqual(['cherni-rayen'])
    const { foundersOf, person } = require('./facts') as typeof import('./facts')
    expect(foundersOf(db, 'relead')).toEqual([{ position: 0, name: 'Hadhami Rjiba', slug: 'hadhami-rjiba', startups: 1 }, { position: 1, name: 'Rayen Cherni', slug: 'cherni-rayen', startups: 2 }])
    expect(foundersOf(db, 'cherni')).toEqual([]) // a startup id, never a person's name
    expect(person(db, 'cherni-rayen')).toEqual(repeat.rows[0])
    expect(person(db, 'nobody-here')).toBeNull()
  })

  test('stored idea checks list the startups they found close', () => {
    const db = database()
    ingest(db, body([row()]), null)
    run(db)
    db.query("INSERT INTO idea_checks (id, idea, language, checked_at, download, compared, matches_json, saved) VALUES ('abc', 'Free Wi-Fi for cafes', 'en', '2026-11-17T10:00:00Z', 1, 1, ?, 1)").run(
      JSON.stringify([{ startupId: 'relead', closeness: 0.6, band: 'close' }, { startupId: 'gone', closeness: 0.58, band: 'close' }, { startupId: 'relead', closeness: 0.5, band: 'far' }]),
    )
    expect(ideaChecks(db)).toEqual([{
      id: 'abc', idea: 'Free Wi-Fi for cafes', language: 'en', checkedAt: '2026-11-17T10:00:00Z', saved: true, download: 1, compared: 1, explanations: null, explainedBy: null,
      matches: [{ startupId: 'relead', name: 'Relead', closeness: 0.6, band: 'close' }, { startupId: 'relead', name: 'Relead', closeness: 0.5, band: 'far' }],
      close: [{ id: 'relead', name: 'Relead' }],
    }])
    db.query("UPDATE idea_checks SET explained_json = ?, explained_model = 'model-x' WHERE id = 'abc'").run(JSON.stringify([{ startupId: 'relead', same: 'Both offer Wi-Fi.', different: 'Nothing in its description.' }]))
    expect(ideaChecks(db)[0]).toMatchObject({ explainedBy: 'model-x', explanations: [{ startupId: 'relead', same: 'Both offer Wi-Fi.', different: 'Nothing in its description.' }] })
    expect(ideaChecks(db, { savedOnly: true })).toHaveLength(1)
    const { ideaCheck } = require('./facts') as typeof import('./facts')
    expect(ideaCheck(db, 'abc')).toEqual(ideaChecks(db)[0])
    expect(ideaCheck(db, 'zzz')).toBeNull()
  })
})
