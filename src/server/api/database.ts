import { createServerFn } from '@tanstack/react-start'
import { getCookie } from '@tanstack/react-start/server'

import type { Database } from 'bun:sqlite'

import { getDatabase } from '../db'

// Every database call is operator-only, checked on the server, not only in the UI.
function requireOperator() {
  if (getCookie('athar_role') !== 'operator') throw new Error('Operator role required')
}

import { DB_PAGE_SIZE as PAGE_SIZE } from '#/shared/database'

// Which pipeline stage writes each table, so the list reads as the pipeline's shelves.
const STAGES: [string, string[]][] = [
  ['Collect', ['source_snapshots', 'source_rows']],
  ['Clean', ['records']],
  ['Merge', ['startups']],
  ['Review', ['review_items']],
  ['Runner', ['runs', 'run_steps']],
  ['Keys', ['ai_keys', 'ai_usage']],
]
const STAGE_OF = new Map(STAGES.flatMap(([stage, names]) => names.map((n) => [n, stage] as const)))

// Secrets never leave the server: these columns are masked in rows and left out of search.
const SECRET: Record<string, string[]> = { ai_keys: ['api_key'] }

type Db = Database
type Column = { name: string; type: string; pk: number }
export type DbValue = string | number | null
export type DbRow = Record<string, DbValue>

function tableNames(db: Db) {
  return db
    .query<{ name: string }, []>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '%_fts%' AND name NOT LIKE 'startup_vectors%' ORDER BY name",
    )
    .all()
    .map((t) => t.name)
}

export const listDbTables = createServerFn().handler(async () => {
  requireOperator()
  const db = getDatabase()
  const tables = tableNames(db).map((name) => ({
    name,
    rows: db.query<{ n: number }, []>(`SELECT COUNT(*) AS n FROM "${name}"`).get()?.n ?? 0,
  }))
  const groups = [...STAGES.map(([stage]) => stage), 'Other'].map((stage) => ({
    stage,
    tables: tables.filter((t) => (STAGE_OF.get(t.name) ?? 'Other') === stage),
  }))
  return groups.filter((g) => g.tables.length)
})

// Column names come from PRAGMA table_info, so they are safe to quote into SQL; anything else is refused.
function describe(db: Db, table: string) {
  if (!tableNames(db).includes(table)) return null
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
  return {
    columns: columns.map((c) => ({ name: c.name, type: c.type.toUpperCase() || 'ANY', blob: c.type.toUpperCase() === 'BLOB', secret: secret.has(c.name) })),
    key: pk ?? '__rowid',
    select,
    searchable,
  }
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
    const sort = data.sort && t.columns.some((c) => c.name === data.sort) ? data.sort : null
    const where = data.q && t.searchable.length ? `WHERE ${t.searchable.map((c) => `CAST("${c}" AS TEXT) LIKE $q ESCAPE '\\'`).join(' OR ')}` : ''
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
    return { table: data.table, columns: t.columns, key: t.key, rows, total, page, pages, q: data.q, sort, dir: data.dir }
  })

// One row in full, for the side panel when it is opened by link (?row=) rather than from the grid.
export const getDbRow = createServerFn()
  .validator((input: { table: string; key: string }) => ({ table: String(input.table), key: String(input.key) }))
  .handler(async ({ data }) => {
    requireOperator()
    const db = getDatabase()
    const t = describe(db, data.table)
    if (!t) return null
    const row = db
      .query<DbRow, [string | number]>(
        `SELECT ${t.key === '__rowid' ? '' : 'rowid AS "__rowid", '}${t.select} FROM "${data.table}" WHERE "${t.key === '__rowid' ? 'rowid' : t.key}" = ?`,
      )
      .get(t.key === '__rowid' ? Number(data.key) : data.key)
    return row ?? null
  })
