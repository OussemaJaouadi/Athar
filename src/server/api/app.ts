import { createServerFn } from '@tanstack/react-start'

import { getDatabase } from '../db'
import { readAsk } from './ask'

export type StartupRow = {
  id: string
  name: string
  description: string | null
  sector: string | null
  cohort: string | null
  creation_year: number | null
  website: string | null
  row?: number | null
}

export type SearchInput = {
  q?: string
  ask?: string
  sector?: string
  from?: number
  to?: number
  website?: 'yes' | 'no'
  described?: 'yes' | 'no'
}

const COLUMNS = 's.id, s.name, s.description, s.sector, s.cohort, s.creation_year, s.website, (SELECT row_number FROM source_rows WHERE id = s.primary_row_id) AS row'
const LABELLED = 'CAST(substr(s.cohort, 4, 4) AS INTEGER)'

/** FTS5 query from free words: every word must match, as a prefix. */
export const ftsAll = (q: string) =>
  q
    .replace(/["*()^:]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => `"${t}"*`)
    .join(' ')

// Search: words over name, description and sector, plus sector, year and evidence filters.
// "ask" reads a sentence into the same filters (see ask.ts) and returns how it read it.
export const searchStartups = createServerFn()
  .validator((input: SearchInput) => input)
  .handler(async ({ data }) => {
    const db = getDatabase()
    const sectors = db
      .query<{ sector: string; count: number }, []>('SELECT sector, COUNT(*) AS count FROM startups WHERE sector IS NOT NULL GROUP BY sector ORDER BY sector')
      .all()
    const years = db
      .query<{ year: number; count: number }, []>(`SELECT ${LABELLED} AS year, COUNT(*) AS count FROM startups s WHERE cohort IS NOT NULL GROUP BY year ORDER BY year`)
      .all()
    const total = db.query<{ n: number }, []>('SELECT COUNT(*) AS n FROM startups').get()?.n ?? 0

    const read = data.ask ? readAsk(data.ask, sectors.map((s) => s.sector)) : null
    const f = { ...data, ...(read?.filters ?? {}) }
    const q = (f.q ?? '').trim()

    const where: string[] = []
    const params: Record<string, string | number> = {}
    if (f.sector) (where.push('s.sector = $sector'), (params.$sector = f.sector))
    if (f.from) (where.push(`${LABELLED} >= $from`), (params.$from = f.from))
    if (f.to) (where.push(`${LABELLED} <= $to`), (params.$to = f.to))
    if (f.website) where.push(f.website === 'yes' ? 's.website IS NOT NULL' : 's.website IS NULL')
    if (f.described) where.push(f.described === 'yes' ? 's.description IS NOT NULL' : 's.description IS NULL')

    let from = 'startups s'
    let order = 's.name'
    if (q) {
      from = 'startups_fts f JOIN startups s ON s.id = f.startup_id'
      where.unshift('startups_fts MATCH $q')
      params.$q = ftsAll(q)
      order = 'rank'
    }
    const clause = where.length ? ` WHERE ${where.join(' AND ')}` : ''
    const matched = db.query<{ n: number }, typeof params>(`SELECT COUNT(*) AS n FROM ${from}${clause}`).get(params)?.n ?? 0
    const rows = db.query<StartupRow, typeof params>(`SELECT ${COLUMNS} FROM ${from}${clause} ORDER BY ${order} LIMIT 200`).all(params)
    return { rows, matched, sectors, years, total, read }
  })

export type Change = { field: string; from: string | null; to: string | null; why: string }
export type ChainInfo = { rowNumber: number; fetchedAt: string; snapshot: string; changes: Change[] }

const text = (v: unknown) => (v === null || v === undefined ? null : typeof v === 'string' ? v : Array.isArray(v) ? v.join(', ') : JSON.stringify(v))

// Profile: the startup, the source rows behind it, and the chain behind its fields.
export const getStartup = createServerFn()
  .validator((id: string) => id)
  .handler(async ({ data: id }) => {
    const db = getDatabase()
    const startup = db
      .query<StartupRow & { founders_json: string; primary_row_id: string | null; domain: string | null; created_at: string }, [string]>(
        'SELECT * FROM startups WHERE id = ?',
      )
      .get(id)
    if (!startup) return null
    const sources = db
      .query<{ source_row_id: string; row_number: number; fetched_at: string; raw_json: string }, [string]>(
        `SELECT r.source_row_id, sr.row_number, ss.fetched_at, sr.raw_json FROM records r
         JOIN source_rows sr ON sr.id = r.source_row_id JOIN source_snapshots ss ON ss.id = r.snapshot_id
         WHERE r.startup_id = ? ORDER BY ss.fetched_at DESC, sr.row_number`,
      )
      .all(id)
    const primary = startup.primary_row_id
      ? db
          .query<{ row_number: number; fetched_at: string; content_hash: string; changes_json: string }, [string]>(
            `SELECT sr.row_number, ss.fetched_at, ss.content_hash, r.changes_json FROM records r
             JOIN source_rows sr ON sr.id = r.source_row_id JOIN source_snapshots ss ON ss.id = r.snapshot_id
             WHERE r.source_row_id = ?`,
          )
          .get(startup.primary_row_id)
      : null
    const reviews = db
      .query<{ code: string; message: string; status: string }, [string, string]>(
        'SELECT code, message, status FROM review_items WHERE startup_id = ? OR source_row_id = ?',
      )
      .all(id, startup.primary_row_id ?? '')
    const chain: ChainInfo | null = primary
      ? {
          rowNumber: primary.row_number,
          fetchedAt: primary.fetched_at,
          snapshot: primary.content_hash.slice(0, 8),
          changes: (JSON.parse(primary.changes_json) as { field: string; from: unknown; to: unknown; why: string }[]).map((c) => ({ field: c.field, from: text(c.from), to: text(c.to), why: c.why })),
        }
      : null
    // Neighbours are facts, not guesses: same sector, closest labelling year first.
    const neighbours = startup.sector
      ? db
          .query<StartupRow, [string, string, string | null]>(
            `SELECT ${COLUMNS} FROM startups s WHERE s.sector = ? AND s.id != ?
             ORDER BY abs(CAST(substr(s.cohort, 4, 4) AS INTEGER) - CAST(substr(?, 4, 4) AS INTEGER)), s.name LIMIT 5`,
          )
          .all(startup.sector, id, startup.cohort)
      : []
    return { startup: { ...startup, founders: JSON.parse(startup.founders_json) as string[] }, sources, chain, reviews, neighbours }
  })

export type WallTile = { id: string; name: string; sector: string | null; year: number | null; described: boolean }

// The wall: one tile per startup, in sector order, for the archive overview and the palette.
export const getWall = createServerFn().handler(async () => {
  return getDatabase()
    .query<{ id: string; name: string; sector: string | null; year: number | null; described: number }, []>(
      `SELECT id, name, sector, CAST(substr(cohort, 4, 4) AS INTEGER) AS year, description IS NOT NULL AS described
       FROM startups ORDER BY sector, year, name`,
    )
    .all()
    .map((t): WallTile => ({ ...t, described: t.described === 1 }))
})

// Landscape: counts that open the startups behind them.
export const getLandscape = createServerFn().handler(async () => {
  const db = getDatabase()
  const byYear = db
    .query<{ year: string; count: number }, []>(
      'SELECT substr(cohort, 4, 4) AS year, COUNT(*) AS count FROM startups WHERE cohort IS NOT NULL GROUP BY year ORDER BY year',
    )
    .all()
  const bySector = db
    .query<{ sector: string; count: number }, []>('SELECT sector, COUNT(*) AS count FROM startups WHERE sector IS NOT NULL GROUP BY sector ORDER BY count DESC')
    .all()
  const grid = db
    .query<{ sector: string; year: string; count: number }, []>(
      'SELECT sector, substr(cohort, 4, 4) AS year, COUNT(*) AS count FROM startups WHERE sector IS NOT NULL AND cohort IS NOT NULL GROUP BY sector, year',
    )
    .all()
  const facts = db
    .query<{ total: number; described: number; websites: number; lag: number | null; rows: number }, []>(
      `SELECT COUNT(*) AS total, SUM(description IS NOT NULL) AS described, SUM(website IS NOT NULL) AS websites,
              AVG(CAST(substr(cohort, 4, 4) AS INTEGER) - creation_year) AS lag,
              (SELECT COUNT(*) FROM records) AS rows
       FROM startups`,
    )
    .get()
  return { byYear, bySector, grid, facts }
})

export const getEmbeddingCount = createServerFn().handler(async () => {
  return getDatabase().query<{ n: number }, []>('SELECT COUNT(*) AS n FROM embedding_meta').get()?.n ?? 0
})

// The corpus line shown in every reading-room page: what the archive holds and how fresh it is.
export const getCorpus = createServerFn().handler(async () => {
  const db = getDatabase()
  const snap = db.query<{ fetched_at: string; row_count: number }, []>('SELECT fetched_at, row_count FROM source_snapshots ORDER BY fetched_at DESC LIMIT 1').get()
  const startups = db.query<{ n: number }, []>('SELECT COUNT(*) AS n FROM startups').get()?.n ?? 0
  const embedded = db.query<{ n: number }, []>('SELECT COUNT(*) AS n FROM embedding_meta').get()?.n ?? 0
  return { startups, rows: snap?.row_count ?? 0, fetchedAt: snap?.fetched_at ?? null, embedded }
})

export type RegistryCard = { id: string; name: string; sector: string | null; row: number | null; cohort: string | null; description: string | null }

const CARD_SQL = `SELECT s.id, s.name, s.sector, sr.row_number AS row, s.cohort, substr(s.description, 1, 320) AS description
  FROM startups s LEFT JOIN source_rows sr ON sr.id = s.primary_row_id`

// The wall on the home page: a few startups from every sector, the same ones on every visit.
export const getWallCards = createServerFn()
  .validator((input: { ids?: string[]; perSector?: number }) => input)
  .handler(async ({ data }) => {
    const db = getDatabase()
    if (data.ids?.length) {
      const all = db.query<RegistryCard, []>(`${CARD_SQL} WHERE s.id IN (${data.ids.map((id) => `'${id.replace(/'/g, '')}'`).join(',')})`).all()
      const byId = new Map(all.map((c) => [c.id, c]))
      return data.ids.map((id) => byId.get(id)).filter((c): c is RegistryCard => !!c)
    }
    const per = Math.min(8, Math.max(1, data.perSector ?? 3))
    return db
      .query<RegistryCard, [number]>(
        `SELECT id, name, sector, row, cohort, description FROM (
           SELECT c.*, ROW_NUMBER() OVER (PARTITION BY c.sector ORDER BY length(c.description) DESC, c.name) AS k
           FROM (${CARD_SQL} WHERE s.description IS NOT NULL) c
         ) WHERE k <= ? ORDER BY k, sector`,
      )
      .all(per)
  })
