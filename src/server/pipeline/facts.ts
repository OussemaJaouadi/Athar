import type { Database } from 'bun:sqlite'

import { cleanEntry } from './clean'
import type { RegistryRow } from './registry'
import { differences } from './state'

// The rows behind the numbers. Every counted fact a step reports can be opened as the startups or entries it counts,
// and the registry's own changes can be read download by download.

export type FactRow = {
  startupId: string | null
  name: string
  value: string | null
  /** 'YYYY-MM', the startup's label month. */
  labelled: string | null
  /** When this was seen: the website's last check for website facts, otherwise the last download that published the startup. */
  observedOn: string | null
  entryId?: string
}

const NOTE_CODES = ['no_description', 'listed_more_than_once', 'other_sector', 'other_name', 'website_text_removed', 'second_website', 'website_unreadable', 'label_unreadable', 'label_before_creation']

/**
 * The rows a counted fact stands for, as the data is now. `code` is the code of a note in run_steps.notes_json.
 * Returns null for a code that has no rows behind it (for example startups_unchanged).
 */
export function factRows(db: Database, code: string, limit = 500): { rows: FactRow[]; total: number } | null {
  const list = (sql: string, ...params: (string | number)[]) => {
    const rows = db.query<{ id: string | null; name: string; value: string | null; labelled: string | null; observed: string | null; entry_id?: string }, (string | number)[]>(sql).all(...params)
    return {
      rows: rows.slice(0, limit).map((r): FactRow => ({ startupId: r.id, name: r.name, value: r.value, labelled: r.labelled, observedOn: r.observed, ...(r.entry_id ? { entryId: r.entry_id } : {}) })),
      total: rows.length,
    }
  }
  const latest = db.query<{ id: number | null }, []>('SELECT MAX(id) AS id FROM downloads').get()?.id ?? 0
  // A fact read from the registry was last seen when the startup was last published.
  const published = '(SELECT d.last_checked_at FROM downloads d WHERE d.id = s.last_download) AS observed'

  if (NOTE_CODES.includes(code))
    return list(
      `SELECT s.id, s.name, json_extract(n.value, '$.text') AS value, s.labelled, ${published} FROM startups s, json_each(s.notes_json) n
       WHERE json_extract(n.value, '$.code') = ? AND s.last_download = ? ORDER BY s.name COLLATE NOCASE`,
      code, latest,
    )
  if (code === 'not_in_registry')
    return list(
      `SELECT s.id, s.name, 'Last published on ' || substr(d.last_checked_at, 1, 10) AS value, s.labelled, d.last_checked_at AS observed
       FROM startups s JOIN downloads d ON d.id = s.last_download WHERE s.last_download < ? ORDER BY s.last_download DESC, s.name COLLATE NOCASE`,
      latest,
    )
  // A fact about a website was seen when the website was last asked.
  const check = `SELECT s.id, s.name, w.url || ' · ' || w.detail AS value, s.labelled, w.checked_at AS observed FROM website_checks w JOIN startups s ON s.id = w.startup_id`
  if (code === 'reachable' || code === 'unreachable') return list(`${check} WHERE w.status = ? ORDER BY w.detail, s.name COLLATE NOCASE`, code)
  if (code.startsWith('unreachable:')) return list(`${check} WHERE w.status = 'unreachable' AND w.detail = ? ORDER BY s.name COLLATE NOCASE`, code.slice('unreachable:'.length))
  if (code === 'moved')
    return list(
      `SELECT s.id, s.name, w.url || ' now answers from ' || w.final_host AS value, s.labelled, w.checked_at AS observed
       FROM website_checks w JOIN startups s ON s.id = w.startup_id WHERE w.status = 'reachable' AND w.final_host IS NOT NULL ORDER BY s.name COLLATE NOCASE`,
    )
  if (code === 'social_not_checked') return list(`SELECT s.id, s.name, s.website AS value, s.labelled, ${published} FROM startups s WHERE s.website_kind = 'social' ORDER BY s.name COLLATE NOCASE`)
  if (code === 'no_website') return list(`SELECT s.id, s.name, NULL AS value, s.labelled, ${published} FROM startups s WHERE s.website IS NULL ORDER BY s.name COLLATE NOCASE`)
  if (code === 'from_prepared')
    return list('SELECT s.id, s.name, p.text AS value, s.labelled, p.created_at AS observed FROM prepared_texts p JOIN startups s ON s.id = p.startup_id ORDER BY s.name COLLATE NOCASE')
  if (code === 'exact_copies')
    return list(
      `SELECT e.startup_id AS id, json_extract(e.raw_json, '$.name') AS name, 'Published ' || e.copies || ' times, character for character' AS value,
              (SELECT s.labelled FROM startups s WHERE s.id = e.startup_id) AS labelled,
              (SELECT d.last_checked_at FROM downloads d WHERE d.id = e.last_download) AS observed, e.id AS entry_id
       FROM entries e WHERE e.copies > 1 AND e.last_download = ? ORDER BY name COLLATE NOCASE`,
      latest,
    )
  return null
}

export type DownloadSummary = {
  id: number
  fetchedAt: string
  lastCheckedAt: string
  rows: number
  /** Entries this download published for the first time. */
  entriesNew: number
  /** Entries the previous download had and this one no longer publishes. */
  entriesGone: number
  /** Startups first seen in this download, and startups whose last entry disappeared with it. */
  startupsNew: number
  startupsGone: number
  /** Known startups whose published row changed: an older entry stopped with the previous download and a new one took its place. */
  startupsEdited: number
}

/** Every download, newest first, with what it added and what it no longer published. */
export function downloads(db: Database): DownloadSummary[] {
  return db
    .query<
      { id: number; fetched_at: string; last_checked_at: string; row_count: number; entries_new: number; entries_gone: number; startups_new: number; startups_gone: number; startups_edited: number },
      []
    >(
      `SELECT d.id, d.fetched_at, d.last_checked_at, d.row_count,
              (SELECT COUNT(*) FROM entries e WHERE e.first_download = d.id) AS entries_new,
              (SELECT COUNT(*) FROM entries e WHERE e.last_download = (SELECT MAX(p.id) FROM downloads p WHERE p.id < d.id)) AS entries_gone,
              (SELECT COUNT(*) FROM startups s WHERE s.first_download = d.id) AS startups_new,
              (SELECT COUNT(*) FROM startups s WHERE s.last_download = (SELECT MAX(p.id) FROM downloads p WHERE p.id < d.id)) AS startups_gone,
              (SELECT COUNT(DISTINCT e.startup_id) FROM entries e JOIN startups s ON s.id = e.startup_id
               WHERE e.first_download = d.id AND s.first_download < d.id
                 AND EXISTS (SELECT 1 FROM entries o WHERE o.startup_id = e.startup_id AND o.first_download < d.id
                             AND o.last_download = (SELECT MAX(p.id) FROM downloads p WHERE p.id < d.id))) AS startups_edited
       FROM downloads d ORDER BY d.id DESC`,
    )
    .all()
    .map((d) => ({ id: d.id, fetchedAt: d.fetched_at, lastCheckedAt: d.last_checked_at, rows: d.row_count, entriesNew: d.entries_new, entriesGone: d.entries_gone, startupsNew: d.startups_new, startupsGone: d.startups_gone, startupsEdited: d.startups_edited }))
}

export type FieldEdit = { field: string; before: string | null; after: string | null }
export type DownloadChange = {
  entryId: string
  name: string
  startupId: string | null
  startupName: string | null
  sector: string | null
  /** 'YYYY-MM' */
  labelled: string | null
  kind: 'new startup' | 'new listing of a known startup' | 'edited' | 'withdrawn' | 'startup withdrawn'
  /** For 'edited' only: what the new row reads differently from the row it replaced. */
  differences?: FieldEdit[]
}

/** What one download changed against the one before it, entry by entry. Null for an unknown download. */
export function downloadChanges(db: Database, id: number): DownloadChange[] | null {
  if (!db.query<{ id: number }, [number]>('SELECT id FROM downloads WHERE id = ?').get(id)) return null
  const previous = db.query<{ id: number | null }, [number]>('SELECT MAX(id) AS id FROM downloads WHERE id < ?').get(id)?.id ?? null
  const row = `SELECT e.id AS entry_id, e.raw_json, json_extract(e.raw_json, '$.name') AS name, e.startup_id, s.name AS startup_name, s.sector, s.labelled,
               s.first_download, s.last_download,
               (SELECT o.raw_json FROM entries o WHERE o.startup_id = e.startup_id AND o.last_download = ?2 AND o.first_download < ?1 ORDER BY o.id LIMIT 1) AS replaced
               FROM entries e LEFT JOIN startups s ON s.id = e.startup_id`
  type R = { entry_id: string; raw_json: string; name: string; startup_id: string | null; startup_name: string | null; sector: string | null; labelled: string | null
    first_download: number | null; last_download: number | null; replaced: string | null }
  const added = db.query<R, [number, number]>(`${row} WHERE e.first_download = ?1 ORDER BY name COLLATE NOCASE`).all(id, previous ?? -1)
  const gone = previous === null ? [] : db.query<R, [number, number]>(`${row} WHERE e.last_download = ?2 ORDER BY name COLLATE NOCASE`).all(id, previous)
  const base = (r: R) => ({ entryId: r.entry_id, name: r.name, startupId: r.startup_id, startupName: r.startup_name, sector: r.sector, labelled: r.labelled })
  const read = (json: string) => cleanEntry(JSON.parse(json) as RegistryRow).cleaned
  return [
    ...added.map((r): DownloadChange => {
      // A known startup whose earlier entry stopped with the previous download was edited, not listed again.
      if (r.first_download === id) return { ...base(r), kind: 'new startup' }
      if (!r.replaced) return { ...base(r), kind: 'new listing of a known startup' }
      // Compared as read, so text withheld from a website field cannot appear here.
      return { ...base(r), kind: 'edited', differences: differences(read(r.raw_json), read(r.replaced)).map((d) => ({ field: d.field, before: d.there, after: d.here })) }
    }),
    ...gone
      // The withdrawn side of an edit is already said by its "edited" row.
      .filter((r) => !added.some((a) => a.startup_id && a.startup_id === r.startup_id && a.first_download !== id))
      .map((r): DownloadChange => ({ ...base(r), kind: r.last_download === previous ? 'startup withdrawn' : 'withdrawn' })),
  ]
}

/** Words written all in capitals: "Rayen CHERNI" has one. Between two spellings used as often, the calmer one is shown. */
const capitals = (name: string) => name.split(/\s+/).filter((w) => w.length > 1 && w === w.toUpperCase()).length

export type PersonRow = { slug: string; name: string; spellings: string[]; startups: { id: string; name: string; labelled: string | null }[] }

/** People named as founders, by person key. `q` matches any spelling; `repeat` keeps those on more than one startup. */
export function people(db: Database, options: { q?: string; repeat?: boolean; limit?: number; offset?: number } = {}): { rows: PersonRow[]; total: number } {
  const q = options.q?.trim()
  const like = q ? `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%` : '%'
  const keys = db
    .query<{ person_key: string; n: number }, [string]>(
      `SELECT person_key, COUNT(DISTINCT startup_id) AS n FROM founders
       WHERE person_key IN (SELECT person_key FROM founders WHERE name LIKE ?1 ESCAPE '\\')
       GROUP BY person_key ${options.repeat ? 'HAVING n > 1' : ''} ORDER BY n DESC, MIN(name) COLLATE NOCASE`,
    )
    .all(like)
  const mine = db.query<{ name: string; id: string; startup: string; labelled: string | null }, [string]>(
    'SELECT f.name, s.id, s.name AS startup, s.labelled FROM founders f JOIN startups s ON s.id = f.startup_id WHERE f.person_key = ? ORDER BY s.labelled, s.name',
  )
  const offset = options.offset ?? 0
  const rows = keys.slice(offset, offset + (options.limit ?? 50)).map((k): PersonRow => {
    const on = mine.all(k.person_key)
    const spellings = [...new Set(on.map((o) => o.name))]
    const count = (s: string) => on.filter((o) => o.name === s).length
    const name = [...spellings].sort((a, b) => count(b) - count(a) || capitals(a) - capitals(b))[0]
    return { slug: k.person_key.replace(/ /g, '-'), name, spellings: spellings.filter((s) => s !== name), startups: on.map((o) => ({ id: o.id, name: o.startup, labelled: o.labelled })) }
  })
  return { rows, total: keys.length }
}

export type IdeaCheckMatch = { startupId: string; name: string; closeness: number; band: 'close' | 'far' | 'nearest' }
export type IdeaCheckRow = {
  id: string
  idea: string
  language: string | null
  checkedAt: string
  saved: boolean
  /** The download it was compared with, and how many startups had a description to compare. */
  download: number | null
  compared: number
  /** Every startup the check kept, closest first, with its band. Startups that have since left the data are dropped. */
  matches: IdeaCheckMatch[]
  /** The close ones only: the same as matches filtered on band 'close'. */
  close: { id: string; name: string }[]
  /** The AI's two sentences per close startup; null when the model was never asked. */
  explanations: { startupId: string; same: string; different: string }[] | null
  explainedBy: string | null
}

type IdeaCheckStored = { id: string; idea: string; language: string | null; checked_at: string; saved: number; download: number | null; compared: number; matches_json: string; explained_json: string | null; explained_model: string | null }
const IDEA_CHECK = 'SELECT id, idea, language, checked_at, saved, download, compared, matches_json, explained_json, explained_model FROM idea_checks'

function toIdeaCheck(db: Database, c: IdeaCheckStored): IdeaCheckRow {
  const name = db.query<{ name: string }, [string]>('SELECT name FROM startups WHERE id = ?')
  const matches = (JSON.parse(c.matches_json) as { startupId: string; closeness: number; band: IdeaCheckMatch['band'] }[])
    .flatMap((m): IdeaCheckMatch[] => {
      const s = name.get(m.startupId)
      return s ? [{ startupId: m.startupId, name: s.name, closeness: m.closeness, band: m.band }] : []
    })
    .sort((a, b) => b.closeness - a.closeness)
  return {
    id: c.id, idea: c.idea, language: c.language, checkedAt: c.checked_at, saved: c.saved === 1, download: c.download, compared: c.compared, matches,
    close: matches.filter((m) => m.band === 'close').map((m) => ({ id: m.startupId, name: m.name })),
    explanations: c.explained_json ? (JSON.parse(c.explained_json) as { startupId: string; same: string; different: string }[]) : null,
    explainedBy: c.explained_model,
  }
}

/** Every stored idea check, newest first, with everything it found. */
export function ideaChecks(db: Database, options: { savedOnly?: boolean; limit?: number } = {}): IdeaCheckRow[] {
  return db
    .query<IdeaCheckStored, [number]>(`${IDEA_CHECK} ${options.savedOnly ? 'WHERE saved = 1' : ''} ORDER BY checked_at DESC LIMIT ?`)
    .all(options.limit ?? 100)
    .map((c) => toIdeaCheck(db, c))
}

// ── One of each, by its own id ──────────────────────────────────────────────────────────────────

export type FounderRow = { position: number; name: string; slug: string; /** Startups this person is named on, this one included. */ startups: number }

/** The founders of one startup, in published order, each with the slug of the person. */
export function foundersOf(db: Database, startupId: string): FounderRow[] {
  return db
    .query<{ position: number; name: string; person_key: string; startups: number }, [string]>(
      `SELECT f.position, f.name, f.person_key, (SELECT COUNT(DISTINCT o.startup_id) FROM founders o WHERE o.person_key = f.person_key) AS startups
       FROM founders f WHERE f.startup_id = ? ORDER BY f.position`,
    )
    .all(startupId)
    .map((f) => ({ position: f.position, name: f.name, slug: f.person_key.replace(/ /g, '-'), startups: f.startups }))
}

/** One person by slug, whatever page of the list they are on; null when nobody has that key. */
export function person(db: Database, slug: string): PersonRow | null {
  const on = db
    .query<{ name: string; id: string; startup: string; labelled: string | null }, [string]>(
      'SELECT f.name, s.id, s.name AS startup, s.labelled FROM founders f JOIN startups s ON s.id = f.startup_id WHERE f.person_key = ? ORDER BY s.labelled, s.name',
    )
    .all(slug.replace(/-/g, ' '))
  if (!on.length) return null
  const spellings = [...new Set(on.map((o) => o.name))]
  const count = (s: string) => on.filter((o) => o.name === s).length
  const name = [...spellings].sort((a, b) => count(b) - count(a) || capitals(a) - capitals(b))[0]
  return { slug, name, spellings: spellings.filter((s) => s !== name), startups: on.map((o) => ({ id: o.id, name: o.startup, labelled: o.labelled })) }
}

/** One stored idea check by id, however old; null when it does not exist. */
export function ideaCheck(db: Database, id: string): IdeaCheckRow | null {
  const c = db.query<IdeaCheckStored, [string]>(`${IDEA_CHECK} WHERE id = ?`).get(id)
  return c ? toIdeaCheck(db, c) : null
}

// ── Quality: what is doubtful or missing now ────────────────────────────────────────────────────

export type QualityGroup = 'missing' | 'website' | 'listing' | 'reading' | 'registry'
export type QualityFact = { code: string; group: QualityGroup; label: string; count: number }

const QUALITY: [string, QualityGroup, string][] = [
  ['no_description', 'missing', 'No description in the registry'],
  ['no_website', 'missing', 'No website in the registry'],
  ['moved', 'website', 'Website answers from a different domain'],
  ['social_not_checked', 'website', 'Only a page on a social network'],
  ['listed_more_than_once', 'listing', 'Listed more than once'],
  ['exact_copies', 'listing', 'Published twice, character for character'],
  ['other_sector', 'listing', 'Listed under two sectors'],
  ['other_name', 'listing', 'Listed under two names'],
  ['website_text_removed', 'reading', 'Website field held extra text'],
  ['second_website', 'reading', 'Website field held two addresses'],
  ['website_unreadable', 'reading', 'Website field holds no address'],
  ['label_unreadable', 'reading', 'Label is not a month and year'],
  ['label_before_creation', 'reading', 'Labelled before its creation year'],
  ['not_in_registry', 'registry', 'No longer published by the registry'],
]
const REASON: Record<string, string> = {
  'no such domain': 'the domain no longer exists', 'certificate problem': 'its security certificate is not valid', 'timed out': 'no answer within 15 seconds',
  'connection refused': 'the server refused the connection', 'connection dropped': 'the server dropped the connection', 'redirects without end': 'it redirects without end',
}

/**
 * Every fact getFactRows can open, counted on today's data, zero included for the fixed ones so that "none" is said.
 * A website that does not answer is one fact per reason, largest first; each code opens with factRows(code).
 */
export function qualitySummary(db: Database): QualityFact[] {
  const fixed = QUALITY.map(([code, group, label]): QualityFact => ({ code, group, label, count: factRows(db, code, 0)?.total ?? 0 }))
  const silent = db
    .query<{ detail: string; n: number }, []>("SELECT detail, COUNT(*) AS n FROM website_checks WHERE status = 'unreachable' GROUP BY detail ORDER BY n DESC, detail")
    .all()
    .map((d): QualityFact => {
      const code = /answered (\d{3})/.exec(d.detail)?.[1]
      return { code: `unreachable:${d.detail}`, group: 'website', label: `Website does not answer: ${REASON[d.detail] ?? (code ? `the server answered ${code}` : d.detail)}`, count: d.n }
    })
  const at = fixed.findIndex((f) => f.group === 'website')
  return [...fixed.slice(0, at), ...silent, ...fixed.slice(at)]
}

// ── Startups, for the operator ──────────────────────────────────────────────────────────────────

export type StartupHit = {
  id: string; name: string; sector: string | null
  /** Entries the registry has published for it, and the codes of the notes it carries. */
  entries: number
  notes: string[]
  /** No longer published by the registry. */
  withdrawn: boolean
}

/** Startups by name, exact slug, website, or the start of one of their entries' ids. An exact slug or entry id comes first. */
export function searchStartups(db: Database, q: string, limit = 30): StartupHit[] {
  const text = q.trim()
  if (!text) return []
  const like = `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`
  const hex = /^[0-9a-f]{3,12}$/i.test(text) ? text.toLowerCase() : null
  return db
    .query<{ id: string; name: string; sector: string | null; entries: number; notes_json: string; withdrawn: number }, [string, string, string, number]>(
      `SELECT s.id, s.name, s.sector, (SELECT COUNT(*) FROM entries e WHERE e.startup_id = s.id) AS entries, s.notes_json,
              s.last_download < (SELECT MAX(id) FROM downloads) AS withdrawn
       FROM startups s
       WHERE s.id = ?1 OR s.name LIKE ?2 ESCAPE '\\' OR s.website LIKE ?2 ESCAPE '\\'
          OR (?3 <> '' AND EXISTS (SELECT 1 FROM entries e WHERE e.startup_id = s.id AND e.id LIKE ?3 || '%'))
       ORDER BY s.id = ?1 DESC, (?3 <> '' AND EXISTS (SELECT 1 FROM entries e WHERE e.startup_id = s.id AND e.id LIKE ?3 || '%')) DESC,
                s.name LIKE ?1 || '%' DESC, s.name COLLATE NOCASE LIMIT ?4`,
    )
    .all(text.toLowerCase(), like, hex ?? '', limit)
    .map((s) => ({ id: s.id, name: s.name, sector: s.sector, entries: s.entries, notes: (JSON.parse(s.notes_json) as { code: string }[]).map((n) => n.code), withdrawn: s.withdrawn === 1 }))
}
