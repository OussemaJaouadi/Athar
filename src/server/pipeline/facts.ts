import type { Database } from 'bun:sqlite'

// The rows behind the numbers. Every counted fact a step reports can be opened as the startups or entries it counts,
// and the registry's own changes can be read download by download.

export type FactRow = { startupId: string | null; name: string; value: string | null; entryId?: string }

const NOTE_CODES = ['no_description', 'listed_more_than_once', 'other_sector', 'other_name', 'website_text_removed', 'second_website', 'website_unreadable', 'label_unreadable', 'label_before_creation']

/**
 * The rows a counted fact stands for, as the data is now. `code` is the code of a note in run_steps.notes_json.
 * Returns null for a code that has no rows behind it (for example startups_unchanged).
 */
export function factRows(db: Database, code: string, limit = 500): { rows: FactRow[]; total: number } | null {
  const list = (sql: string, ...params: (string | number)[]) => {
    const rows = db.query<{ id: string | null; name: string; value: string | null; entry_id?: string }, (string | number)[]>(sql).all(...params)
    return { rows: rows.slice(0, limit).map((r) => ({ startupId: r.id, name: r.name, value: r.value, ...(r.entry_id ? { entryId: r.entry_id } : {}) })), total: rows.length }
  }
  const latest = db.query<{ id: number | null }, []>('SELECT MAX(id) AS id FROM downloads').get()?.id ?? 0

  if (NOTE_CODES.includes(code))
    return list(
      `SELECT s.id, s.name, json_extract(n.value, '$.text') AS value FROM startups s, json_each(s.notes_json) n
       WHERE json_extract(n.value, '$.code') = ? AND s.last_download = ? ORDER BY s.name COLLATE NOCASE`,
      code, latest,
    )
  if (code === 'not_in_registry')
    return list(
      `SELECT s.id, s.name, 'Last published on ' || substr(d.last_checked_at, 1, 10) AS value FROM startups s JOIN downloads d ON d.id = s.last_download
       WHERE s.last_download < ? ORDER BY s.last_download DESC, s.name COLLATE NOCASE`,
      latest,
    )
  const check = `SELECT s.id, s.name, w.url || ' · ' || w.detail AS value FROM website_checks w JOIN startups s ON s.id = w.startup_id`
  if (code === 'reachable' || code === 'unreachable') return list(`${check} WHERE w.status = ? ORDER BY w.detail, s.name COLLATE NOCASE`, code)
  if (code.startsWith('unreachable:')) return list(`${check} WHERE w.status = 'unreachable' AND w.detail = ? ORDER BY s.name COLLATE NOCASE`, code.slice('unreachable:'.length))
  if (code === 'moved')
    return list(
      `SELECT s.id, s.name, w.url || ' now answers from ' || w.final_host AS value FROM website_checks w JOIN startups s ON s.id = w.startup_id
       WHERE w.status = 'reachable' AND w.final_host IS NOT NULL ORDER BY s.name COLLATE NOCASE`,
    )
  if (code === 'social_not_checked') return list("SELECT id, name, website AS value FROM startups WHERE website_kind = 'social' ORDER BY name COLLATE NOCASE")
  if (code === 'no_website') return list('SELECT id, name, NULL AS value FROM startups WHERE website IS NULL ORDER BY name COLLATE NOCASE')
  if (code === 'from_prepared') return list('SELECT s.id, s.name, p.text AS value FROM prepared_texts p JOIN startups s ON s.id = p.startup_id ORDER BY s.name COLLATE NOCASE')
  if (code === 'exact_copies')
    return list(
      `SELECT e.startup_id AS id, json_extract(e.raw_json, '$.name') AS name, 'Published ' || e.copies || ' times, character for character' AS value, e.id AS entry_id
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
}

/** Every download, newest first, with what it added and what it no longer published. */
export function downloads(db: Database): DownloadSummary[] {
  return db
    .query<
      { id: number; fetched_at: string; last_checked_at: string; row_count: number; entries_new: number; entries_gone: number; startups_new: number; startups_gone: number },
      []
    >(
      `SELECT d.id, d.fetched_at, d.last_checked_at, d.row_count,
              (SELECT COUNT(*) FROM entries e WHERE e.first_download = d.id) AS entries_new,
              (SELECT COUNT(*) FROM entries e WHERE e.last_download = (SELECT MAX(p.id) FROM downloads p WHERE p.id < d.id)) AS entries_gone,
              (SELECT COUNT(*) FROM startups s WHERE s.first_download = d.id) AS startups_new,
              (SELECT COUNT(*) FROM startups s WHERE s.last_download = (SELECT MAX(p.id) FROM downloads p WHERE p.id < d.id)) AS startups_gone
       FROM downloads d ORDER BY d.id DESC`,
    )
    .all()
    .map((d) => ({ id: d.id, fetchedAt: d.fetched_at, lastCheckedAt: d.last_checked_at, rows: d.row_count, entriesNew: d.entries_new, entriesGone: d.entries_gone, startupsNew: d.startups_new, startupsGone: d.startups_gone }))
}

export type DownloadChange = { entryId: string; name: string; startupId: string | null; startupName: string | null; kind: 'new startup' | 'new listing of a known startup' | 'edited' | 'withdrawn' | 'startup withdrawn' }

/** What one download changed against the one before it, entry by entry. Null for an unknown download. */
export function downloadChanges(db: Database, id: number): DownloadChange[] | null {
  if (!db.query<{ id: number }, [number]>('SELECT id FROM downloads WHERE id = ?').get(id)) return null
  const previous = db.query<{ id: number | null }, [number]>('SELECT MAX(id) AS id FROM downloads WHERE id < ?').get(id)?.id ?? null
  const row = `SELECT e.id AS entry_id, json_extract(e.raw_json, '$.name') AS name, e.startup_id, s.name AS startup_name, s.first_download, s.last_download,
               (SELECT COUNT(*) FROM entries o WHERE o.startup_id = e.startup_id AND o.last_download = ?2 AND o.first_download < ?1) AS replaced
               FROM entries e LEFT JOIN startups s ON s.id = e.startup_id`
  type R = { entry_id: string; name: string; startup_id: string | null; startup_name: string | null; first_download: number | null; last_download: number | null; replaced: number }
  const added = db.query<R, [number, number]>(`${row} WHERE e.first_download = ?1 ORDER BY name COLLATE NOCASE`).all(id, previous ?? -1)
  const gone = previous === null ? [] : db.query<R, [number, number]>(`${row} WHERE e.last_download = ?2 ORDER BY name COLLATE NOCASE`).all(id, previous)
  return [
    ...added.map((r): DownloadChange => ({
      entryId: r.entry_id, name: r.name, startupId: r.startup_id, startupName: r.startup_name,
      // A known startup whose earlier entry stopped with the previous download was edited, not listed again.
      kind: r.first_download === id ? 'new startup' : r.replaced > 0 ? 'edited' : 'new listing of a known startup',
    })),
    ...gone
      // The withdrawn side of an edit is already said by its "edited" row.
      .filter((r) => !added.some((a) => a.startup_id && a.startup_id === r.startup_id && a.first_download !== id))
      .map((r): DownloadChange => ({ entryId: r.entry_id, name: r.name, startupId: r.startup_id, startupName: r.startup_name, kind: r.last_download === previous ? 'startup withdrawn' : 'withdrawn' })),
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

export type IdeaCheckRow = { id: string; idea: string; language: string | null; checkedAt: string; saved: boolean; close: { id: string; name: string }[]; explainedBy: string | null }

/** Every stored idea check, newest first, with the startups it found close. */
export function ideaChecks(db: Database, options: { savedOnly?: boolean; limit?: number } = {}): IdeaCheckRow[] {
  const name = db.query<{ name: string }, [string]>('SELECT name FROM startups WHERE id = ?')
  return db
    .query<{ id: string; idea: string; language: string | null; checked_at: string; saved: number; matches_json: string; explained_model: string | null }, [number]>(
      `SELECT id, idea, language, checked_at, saved, matches_json, explained_model FROM idea_checks ${options.savedOnly ? 'WHERE saved = 1' : ''} ORDER BY checked_at DESC LIMIT ?`,
    )
    .all(options.limit ?? 100)
    .map((c) => ({
      id: c.id, idea: c.idea, language: c.language, checkedAt: c.checked_at, saved: c.saved === 1, explainedBy: c.explained_model,
      close: (JSON.parse(c.matches_json) as { startupId: string; band: string }[])
        .filter((m) => m.band === 'close')
        .flatMap((m) => {
          const s = name.get(m.startupId)
          return s ? [{ id: m.startupId, name: s.name }] : []
        }),
    }))
}
