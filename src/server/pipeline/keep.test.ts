import { Database } from 'bun:sqlite'
import { describe, expect, test } from 'bun:test'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import * as sqliteVec from 'sqlite-vec'

import { addNote, citation, exportRows, follow, followed, isFollowed, notesOf, removeNote, toCsv, unfollow } from './keep'

// What the person keeps beside the registry: notes, follows, the export and the citation.
// Run with: bun test

function database() {
  const db = new Database(':memory:', { strict: true })
  db.run('PRAGMA foreign_keys = ON')
  sqliteVec.load(db)
  const dir = join(import.meta.dir, '..', 'migrations')
  for (const file of readdirSync(dir).sort()) db.run(readFileSync(join(dir, file), 'utf8'))
  return db
}

const STAMP = '2026-10-05T08:00:00.000Z'

function download(db: Database, id: number, fetchedAt: string, rows = 3) {
  db.run('INSERT INTO downloads (id, url, fetched_at, last_checked_at, content_hash, byte_size, row_count) VALUES (?, ?, ?, ?, ?, ?, ?)', [
    id,
    'https://startup.gov.tn/registry.json',
    fetchedAt,
    fetchedAt,
    `hash-${id}`,
    100,
    rows,
  ])
}

function startup(
  db: Database,
  id: string,
  name: string,
  extra: { display?: string; sector?: string | null; labelled?: string | null; creation_year?: number | null; website?: string | null; description?: string | null; legal_form?: string | null } = {},
) {
  // A startup belongs to a download; the first startup seeds the default one unless the test made its own.
  db.run('INSERT OR IGNORE INTO downloads (id, url, fetched_at, last_checked_at, content_hash, byte_size, row_count) VALUES (1, ?, ?, ?, ?, 100, 3)', ['https://startup.gov.tn/registry.json', STAMP, STAMP, 'hash-1'])
  db.run('INSERT INTO entries (id, raw_json, copies, first_download, last_download) VALUES (?, ?, 1, 1, 1)', [`entry-${id}`, JSON.stringify({ name })])
  db.run(
    `INSERT INTO startups (id, entry_id, name, display_name, description, sector, website, creation_year, labelled, legal_form, first_download, last_download, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, ?, ?)`,
    [id, `entry-${id}`, name, extra.display ?? null, extra.description ?? null, extra.sector ?? null, extra.website ?? null, extra.creation_year ?? null, extra.labelled ?? null, extra.legal_form ?? null, STAMP, STAMP],
  )
  return id
}

function founder(db: Database, startupId: string, position: number, name: string, display?: string) {
  db.run('INSERT INTO founders (startup_id, position, name, person_key, display_name) VALUES (?, ?, ?, ?, ?)', [startupId, position, name, name.toLowerCase(), display ?? null])
}

function alias(db: Database, id: string, subject: string, value: string) {
  db.run("INSERT INTO readings (id, kind, subject, value, lane, rule, why, basis) VALUES (?, 'alias', ?, ?, 'rule', 'alias.test', 'test', 'basis')", [id, subject, value])
}

function website(db: Database, startupId: string, state: string | null) {
  db.run('INSERT INTO website_checks (startup_id, url, status, detail, checked_at, since, state) VALUES (?, ?, ?, ?, ?, ?, ?)', [
    startupId,
    'https://example.tn/',
    'reachable',
    'answered 200',
    STAMP,
    STAMP,
    state,
  ])
}

function throwsWith(fn: () => unknown, message: string) {
  try {
    fn()
  } catch (error) {
    return error instanceof Error && error.message === message
  }
  return false
}

/** Minimal RFC 4180 reader, used to check that toCsv output reads back to the same cells. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"'
        i++
      } else if (c === '"') quoted = false
      else field += c
    } else if (c === '"') quoted = true
    else if (c === ',') {
      row.push(field)
      field = ''
    } else if (c === '\r' && text[i + 1] === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
      i++
    } else field += c
  }
  return rows
}

describe('notes: validation', () => {
  test('text is required after trimming', () => {
    const db = database()
    startup(db, 's1', 'Alpha')
    expect(throwsWith(() => addNote(db, { startupId: 's1', kind: 'note', text: '' }), 'A note needs some text')).toBe(true)
    expect(throwsWith(() => addNote(db, { startupId: 's1', kind: 'note', text: '   \n ' }), 'A note needs some text')).toBe(true)
  })

  test('kind must be one of the kept kinds; agency is refused', () => {
    const db = database()
    startup(db, 's1', 'Alpha')
    expect(throwsWith(() => addNote(db, { startupId: 's1', kind: 'agency', text: 'x' }), 'Unknown kind of note')).toBe(true)
    expect(throwsWith(() => addNote(db, { startupId: 's1', kind: 'Closed', text: 'x' }), 'Unknown kind of note')).toBe(true)
    expect(throwsWith(() => addNote(db, { startupId: 's1', kind: '', text: 'x' }), 'Unknown kind of note')).toBe(true)
  })

  test('the startup must exist', () => {
    const db = database()
    expect(throwsWith(() => addNote(db, { startupId: 'missing', kind: 'note', text: 'x' }), 'No startup with this id')).toBe(true)
  })

  test('a source must be a web address', () => {
    const db = database()
    startup(db, 's1', 'Alpha')
    for (const source of ['ftp://x.tn', 'startup.gov.tn', 'www.example.tn']) {
      expect(throwsWith(() => addNote(db, { startupId: 's1', kind: 'note', text: 'x', source }), 'A source must be a web address')).toBe(true)
    }
  })

  test('a date reads YYYY, YYYY-MM or YYYY-MM-DD', () => {
    const db = database()
    startup(db, 's1', 'Alpha')
    for (const onDate of ['2023/01', '23', '2023-1', '2023-01-5', 'Jan 2023']) {
      expect(throwsWith(() => addNote(db, { startupId: 's1', kind: 'note', text: 'x', onDate }), 'A date reads YYYY, YYYY-MM or YYYY-MM-DD')).toBe(true)
    }
  })
})

describe('notes: add, list, remove', () => {
  test('a valid note is stored with a UUID, trimmed text and null for empty optionals', () => {
    const db = database()
    startup(db, 's1', 'Alpha')
    const note = addNote(db, { startupId: 's1', kind: 'closed', text: '  Closed in 2023  ', source: '', onDate: '' })
    expect(note.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
    expect(note.startupId).toBe('s1')
    expect(note.kind).toBe('closed')
    expect(note.text).toBe('Closed in 2023')
    expect(note.source).toBeNull()
    expect(note.onDate).toBeNull()
    expect(typeof note.createdAt).toBe('string')
    expect(Number.isNaN(Date.parse(note.createdAt))).toBe(false)
  })

  test('source and onDate are kept when given', () => {
    const db = database()
    startup(db, 's1', 'Alpha')
    const note = addNote(db, { startupId: 's1', kind: 'acquired', text: 'Bought', source: ' https://news.example.tn/a ', onDate: '2023-05' })
    expect(note.source).toBe('https://news.example.tn/a')
    expect(note.onDate).toBe('2023-05')
  })

  test('every date form is accepted, and so is http', () => {
    const db = database()
    startup(db, 's1', 'Alpha')
    for (const onDate of ['2023', '2023-05', '2023-05-17']) {
      expect(addNote(db, { startupId: 's1', kind: 'note', text: 'x', onDate }).onDate).toBe(onDate)
    }
    expect(addNote(db, { startupId: 's1', kind: 'note', text: 'x', source: 'http://old.example.tn' }).source).toBe('http://old.example.tn')
  })

  test('every kind is accepted', () => {
    const db = database()
    startup(db, 's1', 'Alpha')
    for (const kind of ['closed', 'acquired', 'renamed', 'note']) {
      expect(addNote(db, { startupId: 's1', kind, text: kind }).kind).toBe(kind as 'closed')
    }
    expect(notesOf(db, 's1')).toHaveLength(4)
  })

  test('notesOf lists newest first and only that startup', () => {
    const db = database()
    startup(db, 's1', 'Alpha')
    startup(db, 's2', 'Beta')
    addNote(db, { startupId: 's1', kind: 'note', text: 'first' })
    addNote(db, { startupId: 's2', kind: 'note', text: 'other' })
    addNote(db, { startupId: 's1', kind: 'note', text: 'second' })
    addNote(db, { startupId: 's1', kind: 'note', text: 'third' })
    const texts = notesOf(db, 's1').map((n) => n.text)
    expect(texts).toEqual(['third', 'second', 'first'])
    expect(notesOf(db, 's2').map((n) => n.text)).toEqual(['other'])
    expect(notesOf(db, 'nobody')).toEqual([])
  })

  test('removeNote removes once, then reports nothing to remove', () => {
    const db = database()
    startup(db, 's1', 'Alpha')
    const note = addNote(db, { startupId: 's1', kind: 'note', text: 'x' })
    expect(removeNote(db, note.id)).toBe(true)
    expect(removeNote(db, note.id)).toBe(false)
    expect(notesOf(db, 's1')).toEqual([])
  })
})

describe('follows', () => {
  test('follow is true when new and false when repeated', () => {
    const db = database()
    startup(db, 's1', 'Alpha')
    expect(follow(db, 's1')).toBe(true)
    expect(follow(db, 's1')).toBe(false)
    expect(isFollowed(db, 's1')).toBe(true)
  })

  test('following an unknown startup throws', () => {
    const db = database()
    expect(throwsWith(() => follow(db, 'missing'), 'No startup with this id')).toBe(true)
    expect(isFollowed(db, 'missing')).toBe(false)
  })

  test('unfollow is true once, then false; isFollowed follows it', () => {
    const db = database()
    startup(db, 's1', 'Alpha')
    follow(db, 's1')
    expect(unfollow(db, 's1')).toBe(true)
    expect(unfollow(db, 's1')).toBe(false)
    expect(isFollowed(db, 's1')).toBe(false)
  })

  test('followed lists name with display name preferred, sector, labelled, note count, newest follow first', () => {
    const db = database()
    startup(db, 's1', 'ALPHA SARL', { display: 'Alpha', sector: 'Fintech', labelled: '2022-03' })
    startup(db, 's2', 'Beta', { sector: null })
    startup(db, 's3', 'Gamma')
    follow(db, 's1')
    follow(db, 's2')
    addNote(db, { startupId: 's1', kind: 'note', text: 'a' })
    addNote(db, { startupId: 's1', kind: 'closed', text: 'b' })
    const list = followed(db)
    expect(list.map((f) => f.id)).toEqual(['s2', 's1'])
    expect(list[1]).toMatchObject({ id: 's1', name: 'Alpha', sector: 'Fintech', labelled: '2022-03', notes: 2 })
    expect(list[0]).toMatchObject({ id: 's2', name: 'Beta', sector: null, labelled: null, notes: 0 })
    expect(typeof list[0].since).toBe('string')
    expect(list.some((f) => f.id === 's3')).toBe(false)
  })

  test('deleting a startup removes its follows and notes', () => {
    const db = database()
    startup(db, 's1', 'Alpha')
    startup(db, 's2', 'Beta')
    follow(db, 's1')
    addNote(db, { startupId: 's1', kind: 'note', text: 'gone with it' })
    addNote(db, { startupId: 's2', kind: 'note', text: 'stays' })
    db.run('DELETE FROM startups WHERE id = ?', ['s1'])
    expect(isFollowed(db, 's1')).toBe(false)
    expect(db.query<{ n: number }, []>('SELECT COUNT(*) AS n FROM follows').get()?.n).toBe(0)
    expect(db.query<{ n: number }, []>('SELECT COUNT(*) AS n FROM startup_notes').get()?.n).toBe(1)
    expect(notesOf(db, 's2')).toHaveLength(1)
  })
})

describe('exportRows', () => {
  function seeded() {
    const db = database()
    download(db, 1, STAMP)
    startup(db, 's1', 'Bravo', { display: 'Bravo SA', legal_form: 'SA', sector: 'Health', creation_year: 2019, labelled: '2021-06', website: 'https://bravo.tn', description: 'Care, "fast"' })
    startup(db, 's2', 'Atome', { sector: null })
    startup(db, 's3', 'Clio')
    founder(db, 's1', 2, 'Youssef Ben Ali', 'Youssef Ben Ali')
    founder(db, 's1', 1, 'SAMI TRABELSI', 'Sami Trabelsi')
    founder(db, 's1', 3, 'Nadia Karray')
    founder(db, 's2', 1, 'Ines Mahjoub')
    website(db, 's1', 'answers')
    alias(db, 'alias:s1:a', 's1', JSON.stringify('Bravo Care'))
    alias(db, 'alias:s1:b', 's1', JSON.stringify({ name: 'BC' }))
    alias(db, 'alias:s1:c', 's1', JSON.stringify({ value: 'Bravo Health' }))
    alias(db, 'alias:s1:d', 's1', JSON.stringify(42))
    alias(db, 'alias:s1:e', 's1', 'not json')
    alias(db, 'alias:s1:f', 's1', JSON.stringify({ other: 'x' }))
    return db
  }

  test('founders come in position order, display name first, joined with semicolons', () => {
    const rows = exportRows(seeded())
    const bravo = rows.find((r) => r.id === 's1')
    expect(bravo?.founders).toBe('Sami Trabelsi; Youssef Ben Ali; Nadia Karray')
    expect(rows.find((r) => r.id === 's3')?.founders).toBe('')
    expect(rows.find((r) => r.id === 's2')?.founders).toBe('Ines Mahjoub')
  })

  test('other names come from string and object readings, and anything else is skipped', () => {
    const rows = exportRows(seeded())
    const bravo = rows.find((r) => r.id === 's1')
    expect(bravo?.other_names).toBe('Bravo Care; BC; Bravo Health')
    expect(rows.find((r) => r.id === 's2')?.other_names).toBe('')
  })

  test('name is the display name, published_name the registry name, registry_entry and website_state come through', () => {
    const bravo = exportRows(seeded()).find((r) => r.id === 's1')
    expect(bravo).toMatchObject({
      id: 's1',
      name: 'Bravo SA',
      published_name: 'Bravo',
      legal_form: 'SA',
      sector: 'Health',
      creation_year: 2019,
      labelled: '2021-06',
      website: 'https://bravo.tn',
      website_state: 'answers',
      description: 'Care, "fast"',
      registry_entry: 'entry-s1',
    })
  })

  test('a startup with no website check has a null website_state', () => {
    const atome = exportRows(seeded()).find((r) => r.id === 's2')
    expect(atome?.website_state).toBeNull()
    expect(atome?.legal_form).toBeNull()
    expect(atome?.creation_year).toBeNull()
  })

  test('rows are ordered by name', () => {
    expect(exportRows(seeded()).map((r) => r.name)).toEqual(['Atome', 'Bravo SA', 'Clio'])
  })

  test('followedOnly keeps only followed startups', () => {
    const db = seeded()
    follow(db, 's3')
    expect(exportRows(db, { followedOnly: true }).map((r) => r.id)).toEqual(['s3'])
    expect(exportRows(db, { followedOnly: false }).map((r) => r.id)).toEqual(['s2', 's1', 's3'])
  })

  test('ids keeps only those startups; an empty list keeps none', () => {
    const db = seeded()
    expect(exportRows(db, { ids: ['s2', 's1'] }).map((r) => r.id)).toEqual(['s2', 's1'])
    expect(exportRows(db, { ids: ['nobody'] })).toEqual([])
    expect(exportRows(db, { ids: [] })).toEqual([])
  })

  test('followedOnly and ids combine', () => {
    const db = seeded()
    follow(db, 's3')
    expect(exportRows(db, { followedOnly: true, ids: ['s1', 's3'] }).map((r) => r.id)).toEqual(['s3'])
  })
})

describe('toCsv', () => {
  const tricky = {
    id: 'x1',
    name: 'Acme, "Smart" SA',
    published_name: 'Acme Smart',
    legal_form: null,
    sector: 'مرحبا بالعالم',
    creation_year: 2020,
    labelled: '2021-01',
    website: null,
    website_state: 'parked',
    description: 'Line one\nLine two\r\nÉcole',
    founders: 'Ahmed; Léa',
    other_names: '',
    registry_entry: 'entry-x1',
  }

  test('starts with a UTF-8 byte order mark', () => {
    expect(toCsv([tricky]).charCodeAt(0)).toBe(0xfeff)
  })

  test('header row lists the keys in order', () => {
    const header = toCsv([]).replace('﻿', '').split('\r\n')[0]
    expect(header).toBe('id,name,published_name,legal_form,sector,creation_year,labelled,website,website_state,description,founders,other_names,registry_entry')
  })

  test('uses CRLF line ends only', () => {
    const text = toCsv([{ ...tricky, description: 'plain' }, { ...tricky, description: 'plain' }])
    expect(text.split('\r\n')).toHaveLength(4)
    expect(text.endsWith('\r\n')).toBe(true)
    expect(text.replace(/\r\n/g, '').includes('\n')).toBe(false)
    expect(text.replace(/\r\n/g, '').includes('\r')).toBe(false)
  })

  test('quotes commas, quotes and line breaks, doubling quotes', () => {
    const text = toCsv([tricky])
    expect(text).toContain('"Acme, ""Smart"" SA"')
    expect(text).toContain('"Line one\nLine two\r\nÉcole"')
  })

  test('round trips through a CSV reader with the same cells', () => {
    const [header, line] = parseCsv(toCsv([tricky]).replace('\uFEFF', ''))
    expect(header).toHaveLength(13)
    expect(header[0]).toBe('id')
    expect(line[1]).toBe('Acme, "Smart" SA')
    expect(line[9]).toBe('Line one\nLine two\r\nÉcole')
  })

  test('Arabic and accented text stay as written, empty cells stay empty', () => {
    const [, line] = parseCsv(toCsv([tricky]).replace('\uFEFF', ''))
    expect(line[4]).toBe('مرحبا بالعالم')
    expect(line[10]).toBe('Ahmed; Léa')
    expect(line[3]).toBe('')
    expect(line[7]).toBe('')
    expect(line[11]).toBe('')
  })

  test('one line per row plus the header; no rows gives the header alone', () => {
    expect(parseCsv(toCsv([tricky, tricky]))).toHaveLength(3)
    expect(parseCsv(toCsv([]))).toHaveLength(1)
  })
})

describe('citation', () => {
  test('without a download the text says so and the count is 0', () => {
    const db = database()
    const cite = citation(db, new Date('2026-11-18T12:00:00.000Z'))
    expect(cite.text).toBe('Startup Tunisia, registry of labelled startups (startup.gov.tn), as published on no download yet; 0 startups as read by Athar. Retrieved 18 November 2026.')
    expect(cite.bibtex).toContain('@misc{startuptunisia2026,')
    expect(cite.bibtex).toContain('year = {2026}')
    expect(cite.bibtex).toContain('https://startup.gov.tn')
    expect(cite.bibtex).toContain('retrieved 2026-11-18')
  })

  test('with a download the text names its date and the startup count', () => {
    const db = database()
    download(db, 1, '2026-10-05T08:00:00.000Z')
    startup(db, 's1', 'Alpha')
    startup(db, 's2', 'Beta')
    const cite = citation(db, new Date('2026-11-18T12:00:00.000Z'))
    expect(cite.text).toBe('Startup Tunisia, registry of labelled startups (startup.gov.tn), as published on 5 October 2026; 2 startups as read by Athar. Retrieved 18 November 2026.')
    expect(cite.bibtex).toContain('@misc{startuptunisia2026,')
    expect(cite.bibtex).toContain('year = {2026}')
    expect(cite.bibtex).toContain('howpublished = {\\url{https://startup.gov.tn}}')
    expect(cite.bibtex).toContain('author = {{Startup Tunisia}}')
  })

  test('the latest download sets the date, not the first', () => {
    const db = database()
    download(db, 1, '2024-03-02T08:00:00.000Z')
    download(db, 2, '2025-07-09T08:00:00.000Z')
    const cite = citation(db, new Date('2026-11-18T12:00:00.000Z'))
    expect(cite.text).toContain('as published on 9 July 2025;')
    expect(cite.bibtex).toContain('@misc{startuptunisia2025,')
    expect(cite.bibtex).toContain('year = {2025}')
  })
})
