import { createServerFn } from '@tanstack/react-start'
import { getCookie } from '@tanstack/react-start/server'

import type { Database } from 'bun:sqlite'

import { getDatabase } from '../db'
import { cleanEntry, displayRow } from '../pipeline/clean'
import type { RegistryRow } from '../pipeline/registry'

/*
 * Trace on pipeline v2: a startup, the registry entries it was built from, each entry's raw JSON as it may be shown
 * on screen (displayRow), and the changes cleaning makes when reading it. Nothing here exposes the unfiltered
 * raw_json, UUIDs, row positions or startup_keys.
 */

// Every trace call is operator-only, checked on the server, not only in the UI.
function requireOperator() {
  if (getCookie('athar_role') !== 'operator') throw new Error('Operator role required')
}

type Db = Database

function parse<T>(text: string | null | undefined, fallback: T): T {
  if (!text) return fallback
  try {
    return JSON.parse(text) as T
  } catch {
    return fallback
  }
}

export type TraceHit = {
  id: string
  name: string
  sector: string | null
  entries: number
  firstSeen: string | null
  withdrawn: boolean
}

export type TraceGroup = { key: string; label: string; total: number; hits: TraceHit[] }

const LIMIT = 60

// One hit per startup: its entry count, the date it was first downloaded, and whether the registry still lists it.
const HIT_SELECT = `
  SELECT s.id, s.name, s.sector,
    (SELECT COUNT(*) FROM entries e WHERE e.startup_id = s.id) AS entries,
    (SELECT fetched_at FROM downloads d WHERE d.id = s.first_download) AS firstSeen,
    s.last_download < (SELECT MAX(id) FROM downloads) AS withdrawn
  FROM startups s`

const hasNote = (codes: string[]) =>
  `EXISTS (SELECT 1 FROM json_each(s.notes_json) n WHERE json_extract(n.value, '$.code') IN (${codes.map((c) => `'${c}'`).join(', ')}))`

function hits(db: Db, where: string, params: string[], order: string, limit = LIMIT) {
  const rows = db
    .query<Omit<TraceHit, 'withdrawn'> & { withdrawn: number }, string[]>(`${HIT_SELECT} WHERE ${where} ORDER BY ${order} LIMIT ${limit}`)
    .all(...params)
  const total = db.query<{ n: number }, string[]>(`SELECT COUNT(*) AS n FROM startups s WHERE ${where}`).get(...params.slice(0, 1))?.n ?? 0
  return { hits: rows.map((r) => ({ ...r, withdrawn: r.withdrawn === 1 })), total }
}

export const findTraceStartups = createServerFn()
  .validator((q: string) => q.trim().slice(0, 120))
  .handler(async ({ data: q }) => {
    requireOperator()
    const db = getDatabase()
    const startups = db.query<{ n: number }, []>('SELECT COUNT(*) AS n FROM startups').get()?.n ?? 0

    if (q) {
      // Name or slug; an exact slug or name comes first.
      const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`
      const r = hits(
        db,
        "(s.name LIKE ?1 ESCAPE '\\' OR s.id LIKE ?1 ESCAPE '\\')",
        [like, q.toLowerCase()],
        '(lower(s.id) = ?2 OR lower(s.name) = ?2) DESC, s.name COLLATE NOCASE',
      )
      return { query: q, startups, total: r.total, groups: r.hits.length ? [{ key: 'results', label: 'Results', total: r.total, hits: r.hits }] : [] }
    }

    const groups: TraceGroup[] = []
    const several = hits(
      db,
      `((SELECT COUNT(*) FROM entries e WHERE e.startup_id = s.id) > 1 OR ${hasNote(['listed_more_than_once', 'other_name', 'other_sector'])})`,
      [],
      's.name COLLATE NOCASE',
    )
    if (several.total) groups.push({ key: 'several', label: 'Listed more than once', ...several })
    const website = hits(db, hasNote(['website_text_removed', 'second_website']), [], 's.name COLLATE NOCASE')
    if (website.total) groups.push({ key: 'website', label: 'Text removed from the website', ...website })
    const all = hits(db, '1 = 1', [], 's.name COLLATE NOCASE')
    if (all.total) groups.push({ key: 'all', label: 'All startups', ...all })
    return { query: '', startups, total: startups, groups }
  })

export type TraceChange = { field: string; from: string | null; to: string | null; why: string }

/** A value as words for the screen: lists joined, empty as null. */
const text = (v: unknown): string | null => {
  if (v === null || v === undefined || v === '') return null
  if (Array.isArray(v)) return v.map((x) => text(x) ?? '').filter(Boolean).join(', ') || null
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

export type TraceEntry = {
  id: string
  copies: number
  firstSeen: string | null
  lastSeen: string | null
  /** displayRow of the parsed raw entry: what may be shown on screen. */
  row: RegistryRow | null
  changes: TraceChange[]
  /** The startup's values were read from this entry. */
  source: boolean
}

export type TraceStartup = {
  id: string
  name: string
  description: string | null
  sector: string | null
  website: string | null
  founders: string[]
  cohort: string | null
  creationYear: number | null
  websiteStatus: string | null
  websiteCheckedAt: string | null
  entryId: string
  filled: Record<string, string>
  notes: { code: string; text: string }[]
  firstSeen: string | null
  lastSeen: string | null
  withdrawn: boolean
  position: number
  total: number
  entries: TraceEntry[]
}

type StartupRow = {
  id: string
  entry_id: string
  name: string
  description: string | null
  sector: string | null
  website: string | null
  founders_json: string
  cohort: string | null
  creation_year: number | null
  filled_json: string
  notes_json: string
  first_download: number
  last_download: number
  website_status: string | null
  website_checked_at: string | null
}

export const getTraceStartup = createServerFn()
  .validator((id: string) => id)
  .handler(async ({ data: id }): Promise<TraceStartup | null> => {
    requireOperator()
    const db = getDatabase()
    const s = db.query<StartupRow, [string]>('SELECT * FROM startups WHERE id = ?').get(id)
    if (!s) return null

    const fetched = new Map(db.query<{ id: number; fetched_at: string }, []>('SELECT id, fetched_at FROM downloads').all().map((d) => [d.id, d.fetched_at]))
    const newest = db.query<{ n: number | null }, []>('SELECT MAX(id) AS n FROM downloads').get()?.n ?? s.last_download
    const total = db.query<{ n: number }, []>('SELECT COUNT(*) AS n FROM startups').get()?.n ?? 0
    // Position in the alphabetical list, the same order the list uses.
    const position =
      (db
        .query<{ n: number }, [string, string, string]>(
          'SELECT COUNT(*) AS n FROM startups WHERE name < ?1 COLLATE NOCASE OR (name = ?2 COLLATE NOCASE AND id < ?3)',
        )
        .get(s.name, s.name, s.id)?.n ?? 0) + 1

    const entries = db
      .query<{ id: string; raw_json: string; copies: number; first_download: number; last_download: number }, [string]>(
        'SELECT id, raw_json, copies, first_download, last_download FROM entries WHERE startup_id = ? ORDER BY first_download, id',
      )
      .all(s.id)
      .map((e): TraceEntry => {
        const raw = parse<RegistryRow | null>(e.raw_json, null)
        const shown = raw ? displayRow(raw) : null
        // Changes are computed from the verbatim row; what the registry wrote is shown as displayRow shows it.
        const changes = raw
          ? cleanEntry(raw).changes.map((c) => ({
              field: c.field,
              from: text(shown && c.field in shown ? shown[c.field as keyof RegistryRow] : c.from),
              to: text(c.to),
              why: c.why,
            }))
          : []
        return {
          id: e.id,
          copies: e.copies,
          firstSeen: fetched.get(e.first_download) ?? null,
          lastSeen: fetched.get(e.last_download) ?? null,
          row: shown,
          changes,
          source: e.id === s.entry_id,
        }
      })
    // The entry the values were read from comes first.
    entries.sort((a, b) => Number(b.source) - Number(a.source))

    return {
      id: s.id,
      name: s.name,
      description: s.description,
      sector: s.sector,
      website: s.website,
      founders: parse<string[]>(s.founders_json, []),
      cohort: s.cohort,
      creationYear: s.creation_year,
      websiteStatus: s.website_status,
      websiteCheckedAt: s.website_checked_at,
      entryId: s.entry_id,
      filled: parse<Record<string, string>>(s.filled_json, {}),
      notes: parse<{ code: string; text: string }[]>(s.notes_json, []),
      firstSeen: fetched.get(s.first_download) ?? null,
      lastSeen: fetched.get(s.last_download) ?? null,
      withdrawn: s.last_download < newest,
      position,
      total,
      entries,
    }
  })
