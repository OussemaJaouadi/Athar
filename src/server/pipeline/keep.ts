import type { Database } from 'bun:sqlite'

import { now } from '../ids'

// What the person running Athar keeps: their own notes on a startup, the startups they follow, and the
// export that cites the registry download. Nothing here changes a registry value; it all sits beside them.

export const NOTE_KINDS = ['closed', 'acquired', 'renamed', 'note'] as const
export type NoteKind = (typeof NOTE_KINDS)[number]

export type Note = { id: string; startupId: string; kind: NoteKind; text: string; source: string | null; onDate: string | null; createdAt: string }

type NoteRow = { id: string; startup_id: string; kind: string; text: string; source: string | null; on_date: string | null; created_at: string }

const toNote = (r: NoteRow): Note => ({
  id: r.id,
  startupId: r.startup_id,
  kind: r.kind as NoteKind,
  text: r.text,
  source: r.source,
  onDate: r.on_date,
  createdAt: r.created_at,
})

const startupExists = (db: Database, id: string) => db.query<{ one: number }, [string]>('SELECT 1 AS one FROM startups WHERE id = ?').get(id) !== null

const DATE = /^\d{4}(-\d{2}(-\d{2})?)?$/

export function notesOf(db: Database, startupId: string): Note[] {
  return db
    .query<NoteRow, [string]>('SELECT id, startup_id, kind, text, source, on_date, created_at FROM startup_notes WHERE startup_id = ? ORDER BY created_at DESC, rowid DESC')
    .all(startupId)
    .map(toNote)
}

export function addNote(db: Database, input: { startupId: string; kind: string; text: string; source?: string | null; onDate?: string | null }): Note {
  const text = input.text.trim()
  if (!text) throw new Error('A note needs some text')
  if (!(NOTE_KINDS as readonly string[]).includes(input.kind)) throw new Error('Unknown kind of note')
  if (!startupExists(db, input.startupId)) throw new Error('No startup with this id')
  const source = input.source?.trim() || null
  if (source !== null && !/^https?:\/\//.test(source)) throw new Error('A source must be a web address')
  const onDate = input.onDate?.trim() || null
  if (onDate !== null && !DATE.test(onDate)) throw new Error('A date reads YYYY, YYYY-MM or YYYY-MM-DD')
  const note: Note = { id: crypto.randomUUID(), startupId: input.startupId, kind: input.kind as NoteKind, text, source, onDate, createdAt: now() }
  db.run('INSERT INTO startup_notes (id, startup_id, kind, text, source, on_date, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [
    note.id,
    note.startupId,
    note.kind,
    note.text,
    note.source,
    note.onDate,
    note.createdAt,
  ])
  return note
}

export function removeNote(db: Database, id: string): boolean {
  return db.run('DELETE FROM startup_notes WHERE id = ?', [id]).changes > 0
}

export function isFollowed(db: Database, startupId: string): boolean {
  return db.query<{ one: number }, [string]>('SELECT 1 AS one FROM follows WHERE startup_id = ?').get(startupId) !== null
}

/** True when the startup is newly followed; false when it already was. */
export function follow(db: Database, startupId: string): boolean {
  if (!startupExists(db, startupId)) throw new Error('No startup with this id')
  if (isFollowed(db, startupId)) return false
  db.run('INSERT INTO follows (startup_id, created_at) VALUES (?, ?)', [startupId, now()])
  return true
}

export function unfollow(db: Database, startupId: string): boolean {
  return db.run('DELETE FROM follows WHERE startup_id = ?', [startupId]).changes > 0
}

export function followed(db: Database): { id: string; name: string; sector: string | null; labelled: string | null; since: string; notes: number }[] {
  return db
    .query<{ id: string; name: string; sector: string | null; labelled: string | null; since: string; notes: number }, []>(
      `SELECT f.startup_id AS id, COALESCE(s.display_name, s.name) AS name, s.sector, s.labelled, f.created_at AS since,
              (SELECT COUNT(*) FROM startup_notes n WHERE n.startup_id = f.startup_id) AS notes
       FROM follows f JOIN startups s ON s.id = f.startup_id
       ORDER BY f.created_at DESC, f.rowid DESC`,
    )
    .all()
}

// ---- Export -----------------------------------------------------------------------------------------------

export type ExportRow = {
  id: string
  name: string
  published_name: string
  legal_form: string | null
  sector: string | null
  creation_year: number | null
  labelled: string | null
  website: string | null
  website_state: string | null
  description: string | null
  founders: string
  other_names: string
  registry_entry: string
}

type BaseRow = Omit<ExportRow, 'founders' | 'other_names'>

/** An alias reading holds JSON: a string, or an object with a name or value field. Anything else is skipped. */
function aliasName(raw: string): string | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (typeof parsed === 'string') return parsed.trim() || null
  if (parsed !== null && typeof parsed === 'object') {
    const o = parsed as Record<string, unknown>
    const text = typeof o.name === 'string' ? o.name : typeof o.value === 'string' ? o.value : null
    return text?.trim() || null
  }
  return null
}

export function exportRows(db: Database, options: { ids?: string[]; followedOnly?: boolean } = {}): ExportRow[] {
  const where: string[] = []
  const params: string[] = []
  if (options.ids) {
    where.push('s.id IN (SELECT value FROM json_each(?))')
    params.push(JSON.stringify(options.ids))
  }
  if (options.followedOnly) where.push('s.id IN (SELECT startup_id FROM follows)')

  const rows = db
    .query<BaseRow, string[]>(
      `SELECT s.id, COALESCE(s.display_name, s.name) AS name, s.name AS published_name, s.legal_form, s.sector,
              s.creation_year, s.labelled, s.website, wc.state AS website_state, s.description, s.entry_id AS registry_entry
       FROM startups s LEFT JOIN website_checks wc ON wc.startup_id = s.id
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY name, s.id`,
    )
    .all(...params)

  const founders = new Map<string, string[]>()
  for (const f of db.query<{ startup_id: string; name: string }, []>('SELECT startup_id, COALESCE(display_name, name) AS name FROM founders ORDER BY startup_id, position').all()) {
    const list = founders.get(f.startup_id) ?? []
    list.push(f.name)
    founders.set(f.startup_id, list)
  }

  const aliases = new Map<string, string[]>()
  for (const r of db.query<{ subject: string; value: string }, []>("SELECT subject, value FROM readings WHERE kind = 'alias' ORDER BY id").all()) {
    const name = aliasName(r.value)
    if (name === null) continue
    const list = aliases.get(r.subject) ?? []
    list.push(name)
    aliases.set(r.subject, list)
  }

  return rows.map((r) => ({
    ...r,
    founders: (founders.get(r.id) ?? []).join('; '),
    other_names: (aliases.get(r.id) ?? []).join('; '),
  }))
}

const COLUMNS: (keyof ExportRow)[] = [
  'id',
  'name',
  'published_name',
  'legal_form',
  'sector',
  'creation_year',
  'labelled',
  'website',
  'website_state',
  'description',
  'founders',
  'other_names',
  'registry_entry',
]

const cell = (value: string | number | null) => {
  if (value === null) return ''
  const text = String(value)
  return /[,"\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

/** RFC 4180 with CRLF line ends and a UTF-8 BOM, so spreadsheet programs read Arabic and accents. */
export function toCsv(rows: ExportRow[]): string {
  const lines = [COLUMNS.join(','), ...rows.map((r) => COLUMNS.map((c) => cell(r[c])).join(','))]
  return `﻿${lines.join('\r\n')}\r\n`
}

// ---- Citation ---------------------------------------------------------------------------------------------

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const dayMonthYear = (d: Date) => `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`

/**
 * How to cite the registry as Athar read it. The latest download sets the publication date and the year in the
 * BibTeX key; without a download the text says so and the count is 0.
 */
export function citation(db: Database, at: Date): { text: string; bibtex: string } {
  const latest = db.query<{ fetched_at: string }, []>('SELECT fetched_at FROM downloads ORDER BY id DESC LIMIT 1').get()
  const count = db.query<{ n: number }, []>('SELECT COUNT(*) AS n FROM startups').get()?.n ?? 0
  const published = latest ? dayMonthYear(new Date(latest.fetched_at)) : 'no download yet'
  const n = latest ? count : 0
  const year = latest ? new Date(latest.fetched_at).getUTCFullYear() : at.getUTCFullYear()
  const retrieved = at.toISOString().slice(0, 10)
  const text = `Startup Tunisia, registry of labelled startups (startup.gov.tn), as published on ${published}; ${n} startups as read by Athar. Retrieved ${dayMonthYear(at)}.`
  const bibtex = [
    `@misc{startuptunisia${year},`,
    '  title = {Startup Tunisia: registry of labelled startups},',
    '  author = {{Startup Tunisia}},',
    `  year = {${year}},`,
    '  howpublished = {\\url{https://startup.gov.tn}},',
    `  note = {Read with Athar; retrieved ${retrieved}}`,
    '}',
  ].join('\n')
  return { text, bibtex }
}
