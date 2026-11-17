import { createServerFn } from '@tanstack/react-start'
import { getCookie } from '@tanstack/react-start/server'

import type { Database } from 'bun:sqlite'

import { DB_PAGE_SIZE as PAGE_SIZE } from '#/shared/database'
import { getDatabase } from '../db'
import { displayRow } from '../pipeline/clean'
import type { RegistryRow } from '../pipeline/registry'

// Every database call is operator-only, checked on the server, not only in the UI.
function requireOperator() {
  if (getCookie('athar_role') !== 'operator') throw new Error('Operator role required')
}

/*
 * Pipeline v2 in the Database view: downloads, entries and startups, plus the runner and keys.
 * Internal tables (startup_keys, migrations, search and vector indexes) are not listed; the stubs for engines not built
 * yet appear only once they hold rows.
 */
const STAGES: [string, string[]][] = [
  ['Collect', ['downloads', 'entries']],
  ['Build', ['startups']],
  ['Runner', ['runs', 'run_steps']],
  ['Keys', ['ai_keys', 'ai_usage']],
]
const NOT_BUILT = ['embedding_meta', 'prepared_texts']
const STAGE_OF = new Map(STAGES.flatMap(([stage, names]) => names.map((n) => [n, stage] as const)))

// Secrets never leave the server: these columns are masked in rows and left out of search.
const SECRET: Record<string, string[]> = { ai_keys: ['api_key'] }

type Db = Database
type Column = { name: string; type: string; pk: number }
export type DbValue = string | number | null
export type DbRow = Record<string, DbValue>
export type DbColumnInfo = { name: string; type: string; blob: boolean; secret: boolean; virtual?: boolean }

function existing(db: Db) {
  return new Set(
    db
      .query<{ name: string }, []>("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all()
      .map((t) => t.name),
  )
}
const count = (db: Db, table: string) => db.query<{ n: number }, []>(`SELECT COUNT(*) AS n FROM "${table}"`).get()?.n ?? 0

/** The tables the operator may open: the listed stages, plus a not-built stub once it holds rows. */
function visibleTables(db: Db) {
  const have = existing(db)
  return [...STAGES.flatMap(([, names]) => names), ...NOT_BUILT].filter((t) => have.has(t) && (!NOT_BUILT.includes(t) || count(db, t) > 0))
}

export const listDbTables = createServerFn().handler(async () => {
  requireOperator()
  const db = getDatabase()
  const tables = visibleTables(db).map((name) => ({ name, rows: count(db, name) }))
  const groups = [...STAGES.map(([stage]) => stage), 'Not built yet'].map((stage) => ({
    stage,
    tables: tables.filter((t) => (STAGE_OF.get(t.name) ?? 'Not built yet') === stage),
  }))
  return groups.filter((g) => g.tables.length)
})

// An entry's raw row as it may be shown: parsed, then passed through displayRow (withholds the extra text some
// registry rows carry in their website field). The verbatim raw_json never leaves the server.
function shownEntry(rawJson: string | null): RegistryRow | null {
  if (!rawJson) return null
  try {
    return displayRow(JSON.parse(rawJson) as RegistryRow)
  } catch {
    return null
  }
}

// Column names come from PRAGMA table_info, so they are safe to quote into SQL; anything else is refused.
function describe(db: Db, table: string) {
  if (!visibleTables(db).includes(table)) return null
  const columns = db.query<Column, []>(`PRAGMA table_info("${table}")`).all()
  const pk = columns.find((c) => c.pk === 1)?.name ?? null
  const secret = new Set(SECRET[table] ?? [])
  const select = [
    pk ? null : 'rowid AS "__rowid"',
    ...columns.map((c) =>
      secret.has(c.name) ? `'••••' AS "${c.name}"` : c.type.toUpperCase() === 'BLOB' ? `length("${c.name}") AS "${c.name}"` : `"${c.name}"`,
    ),
  ]
    .filter(Boolean)
    .join(', ')
  const searchable = columns.filter((c) => !secret.has(c.name) && c.type.toUpperCase() !== 'BLOB').map((c) => c.name)
  const info: DbColumnInfo[] = columns.map((c) => ({
    name: c.name,
    type: c.type.toUpperCase() || 'ANY',
    blob: c.type.toUpperCase() === 'BLOB',
    secret: secret.has(c.name),
  }))
  // Entries read better with the startup's name beside the hash; it comes from the (filtered) raw row.
  if (table === 'entries') info.splice(1, 0, { name: 'name', type: 'TEXT', blob: false, secret: false, virtual: true })
  return { columns: info, key: pk ?? '__rowid', select, searchable }
}

/** Rows as they may leave the server: an entry's raw_json is replaced by its display form, and its name is added. */
function shape(table: string, rows: DbRow[]): DbRow[] {
  if (table !== 'entries') return rows
  return rows.map((r) => {
    const shown = shownEntry(typeof r.raw_json === 'string' ? r.raw_json : null)
    return { ...r, name: shown?.name ?? null, raw_json: shown ? JSON.stringify(shown) : null }
  })
}

export type DbQuery = { table: string; q?: string; sort?: string; dir?: 'asc' | 'desc'; page?: number }

export const getDbRows = createServerFn()
  .validator((input: DbQuery) => ({
    table: String(input.table),
    q: typeof input.q === 'string' ? input.q.trim().slice(0, 200) : '',
    sort: typeof input.sort === 'string' ? input.sort : undefined,
    dir: input.dir === 'desc' ? ('desc' as const) : ('asc' as const),
    page: Math.max(1, Math.floor(Number(input.page) || 1)),
  }))
  .handler(async ({ data }) => {
    requireOperator()
    const db = getDatabase()
    const t = describe(db, data.table)
    if (!t) return null
    const sort = data.sort && t.columns.some((c) => c.name === data.sort && !c.virtual) ? data.sort : null
    // An entry's raw text can hold text withheld from the screen (displayRow), so it is searched by its
    // displayable fields only: never the website field, never the verbatim JSON as a whole.
    const searchExpr = (c: string) =>
      data.table === 'entries' && c === 'raw_json'
        ? ['name', 'sector', 'desc', 'founders'].map((f) => `CAST(json_extract(raw_json, '$.${f}') AS TEXT) LIKE $q ESCAPE '\\'`).join(' OR ')
        : `CAST("${c}" AS TEXT) LIKE $q ESCAPE '\\'`
    const where = data.q && t.searchable.length ? `WHERE ${t.searchable.map(searchExpr).join(' OR ')}` : ''
    const like = `%${data.q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`
    const params: Record<string, string> = where ? { q: like } : {} // strict mode: keys without the $ prefix
    const total = db.query<{ n: number }, [typeof params]>(`SELECT COUNT(*) AS n FROM "${data.table}" ${where}`).get(params)?.n ?? 0
    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))
    const page = Math.min(data.page, pages)
    const order = sort ? `ORDER BY "${sort}" ${data.dir === 'desc' ? 'DESC' : 'ASC'}, rowid` : 'ORDER BY rowid'
    const rows = db
      .query<DbRow, [typeof params]>(
        `SELECT ${t.key === '__rowid' ? '' : 'rowid AS "__rowid", '}${t.select} FROM "${data.table}" ${where} ${order} LIMIT ${PAGE_SIZE} OFFSET ${(page - 1) * PAGE_SIZE}`,
      )
      .all(params)
    return { table: data.table, columns: t.columns, key: t.key, rows: shape(data.table, rows), total, page, pages, q: data.q, sort, dir: data.dir }
  })

type Seen = { at: string; download: number } | null
export type DbRecord =
  | { kind: 'missing' }
  | {
      kind: 'entry'
      id: string
      row: RegistryRow | null
      copies: number
      firstSeen: Seen
      lastSeen: Seen
      startup: { id: string; name: string } | null
    }
  | {
      kind: 'startup'
      id: string
      name: string
      description: string | null
      sector: string | null
      website: string | null
      founders: string[]
      cohort: string | null
      creationYear: number | null
      notes: { code: string; text: string }[]
      entryId: string
      listings: number
      firstSeen: Seen
      lastSeen: Seen
      withdrawnSince: string | null
    }
  | {
      kind: 'download'
      id: number
      url: string
      fetchedAt: string
      lastCheckedAt: string
      rows: number
      bytes: number
      runId: string | null
      hash: string
      entriesFirstSeen: number
    }
  | { kind: 'row'; columns: DbColumnInfo[]; row: DbRow }

const parse = <T,>(text: string | null, fallback: T): T => {
  if (!text) return fallback
  try {
    return JSON.parse(text) as T
  } catch {
    return fallback
  }
}

// One row read for the record pane, shaped on the server by table so nothing unfiltered or internal reaches the client.
export const getDbRecord = createServerFn()
  .validator((input: { table: string; key: string }) => ({ table: String(input.table), key: String(input.key) }))
  .handler(async ({ data }): Promise<DbRecord> => {
    requireOperator()
    const db = getDatabase()
    const seen = (id: number | null): Seen => {
      if (id === null) return null
      const d = db.query<{ at: string }, [number]>('SELECT fetched_at AS at FROM downloads WHERE id = ?').get(id)
      return d ? { at: d.at, download: id } : null
    }

    if (data.table === 'entries') {
      const e = db
        .query<{ id: string; raw_json: string; copies: number; first_download: number; last_download: number; startup_id: string | null }, [string]>(
          'SELECT id, raw_json, copies, first_download, last_download, startup_id FROM entries WHERE id = ?',
        )
        .get(data.key)
      if (!e) return { kind: 'missing' }
      const s = e.startup_id
        ? db.query<{ id: string; name: string }, [string]>('SELECT id, name FROM startups WHERE id = ?').get(e.startup_id)
        : null
      return {
        kind: 'entry',
        id: e.id,
        row: shownEntry(e.raw_json),
        copies: e.copies,
        firstSeen: seen(e.first_download),
        lastSeen: seen(e.last_download),
        startup: s ?? null,
      }
    }

    if (data.table === 'startups') {
      const s = db
        .query<
          {
            id: string
            entry_id: string
            name: string
            description: string | null
            sector: string | null
            website: string | null
            founders_json: string
            cohort: string | null
            creation_year: number | null
            notes_json: string
            first_download: number
            last_download: number
          },
          [string]
        >(
          'SELECT id, entry_id, name, description, sector, website, founders_json, cohort, creation_year, notes_json, first_download, last_download FROM startups WHERE id = ?',
        )
        .get(data.key)
      if (!s) return { kind: 'missing' }
      const listings = db.query<{ n: number }, [string]>('SELECT COUNT(*) AS n FROM entries WHERE startup_id = ?').get(s.id)?.n ?? 0
      // Withdrawn: the registry has a newer download that no longer lists this startup.
      const after = db
        .query<{ at: string }, [number]>('SELECT fetched_at AS at FROM downloads WHERE id > ? ORDER BY id LIMIT 1')
        .get(s.last_download)
      return {
        kind: 'startup',
        id: s.id,
        name: s.name,
        description: s.description,
        sector: s.sector,
        website: s.website,
        founders: parse<string[]>(s.founders_json, []),
        cohort: s.cohort,
        creationYear: s.creation_year,
        notes: parse<{ code: string; text: string }[]>(s.notes_json, []),
        entryId: s.entry_id,
        listings,
        firstSeen: seen(s.first_download),
        lastSeen: seen(s.last_download),
        withdrawnSince: after?.at ?? null,
      }
    }

    if (data.table === 'downloads') {
      const d = db
        .query<
          { id: number; url: string; fetched_at: string; last_checked_at: string; row_count: number; byte_size: number; run_id: string | null; content_hash: string },
          [number]
        >('SELECT id, url, fetched_at, last_checked_at, row_count, byte_size, run_id, content_hash FROM downloads WHERE id = ?')
        .get(Number(data.key))
      if (!d) return { kind: 'missing' }
      const fresh = db.query<{ n: number }, [number]>('SELECT COUNT(*) AS n FROM entries WHERE first_download = ?').get(d.id)?.n ?? 0
      return {
        kind: 'download',
        id: d.id,
        url: d.url,
        fetchedAt: d.fetched_at,
        lastCheckedAt: d.last_checked_at,
        rows: d.row_count,
        bytes: d.byte_size,
        runId: d.run_id,
        hash: d.content_hash.slice(0, 12),
        entriesFirstSeen: fresh,
      }
    }

    const t = describe(db, data.table)
    if (!t) return { kind: 'missing' }
    const row = db
      .query<DbRow, [string | number]>(
        `SELECT ${t.key === '__rowid' ? '' : 'rowid AS "__rowid", '}${t.select} FROM "${data.table}" WHERE "${t.key === '__rowid' ? 'rowid' : t.key}" = ?`,
      )
      .get(t.key === '__rowid' ? Number(data.key) : data.key)
    return row ? { kind: 'row', columns: t.columns, row } : { kind: 'missing' }
  })
