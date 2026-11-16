import { createServerFn } from '@tanstack/react-start'

import { getDatabase } from '../db'

export type StartupRow = {
  id: string
  name: string
  description: string | null
  sector: string | null
  cohort: string | null
  creation_year: number | null
}

const LIST = 'SELECT id, name, description, sector, cohort, creation_year FROM startups'

// Search: full text over name, description and sector, plus a sector filter.
export const searchStartups = createServerFn()
  .validator((input: { q?: string; sector?: string }) => ({ q: input.q?.trim() ?? '', sector: input.sector?.trim() ?? '' }))
  .handler(async ({ data }) => {
    const db = getDatabase()
    const sectorClause = data.sector ? ' AND s.sector = $sector' : ''
    const params = { $sector: data.sector, $q: data.q.replace(/["*]/g, ' ').split(/\s+/).filter(Boolean).map((t) => `"${t}"*`).join(' ') }
    const rows = data.q
      ? db
          .query<StartupRow, typeof params>(
            `SELECT s.id, s.name, s.description, s.sector, s.cohort, s.creation_year FROM startups_fts f
             JOIN startups s ON s.id = f.startup_id WHERE startups_fts MATCH $q${sectorClause} ORDER BY rank LIMIT 100`,
          )
          .all(params)
      : db.query<StartupRow, typeof params>(`${LIST} s WHERE 1 = 1${sectorClause} ORDER BY name LIMIT 100`).all(params)
    const sectors = db
      .query<{ sector: string; count: number }, []>('SELECT sector, COUNT(*) AS count FROM startups WHERE sector IS NOT NULL GROUP BY sector ORDER BY sector')
      .all()
    const total = db.query<{ n: number }, []>('SELECT COUNT(*) AS n FROM startups').get()?.n ?? 0
    return { rows, sectors, total }
  })

// Profile: the startup, the source rows behind it, and its open review items.
export const getStartup = createServerFn()
  .validator((id: string) => id)
  .handler(async ({ data: id }) => {
    const db = getDatabase()
    const startup = db
      .query<StartupRow & { website: string | null; founders_json: string; primary_row_id: string | null; website_status: string | null; website_checked_at: string | null }, [string]>(
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
    // The chain behind each field: which snapshot and row it came from, and what Clean did to it.
    const primary = startup.primary_row_id
      ? db
          .query<{ row_number: number; fetched_at: string; content_hash: string; changes_json: string }, [string]>(
            `SELECT sr.row_number, ss.fetched_at, ss.content_hash, r.changes_json FROM records r
             JOIN source_rows sr ON sr.id = r.source_row_id JOIN source_snapshots ss ON ss.id = r.snapshot_id
             WHERE r.source_row_id = ?`,
          )
          .get(startup.primary_row_id)
      : null
    const changes = primary
      ? (JSON.parse(primary.changes_json) as { field: string; why: string }[]).map(({ field, why }) => ({ field, why }))
      : []
    return {
      startup: { ...startup, founders: JSON.parse(startup.founders_json) as string[] },
      sources,
      chain: primary
        ? { rowNumber: primary.row_number, fetchedAt: primary.fetched_at, snapshot: primary.content_hash.slice(0, 8), changes }
        : null,
    }
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
      "SELECT substr(cohort, 4, 4) AS year, COUNT(*) AS count FROM startups WHERE cohort IS NOT NULL GROUP BY year ORDER BY year",
    )
    .all()
  const bySector = db
    .query<{ sector: string; count: number }, []>('SELECT sector, COUNT(*) AS count FROM startups GROUP BY sector ORDER BY count DESC')
    .all()
  return { byYear, bySector }
})

export const getEmbeddingCount = createServerFn().handler(async () => {
  return getDatabase().query<{ n: number }, []>('SELECT COUNT(*) AS n FROM embedding_meta').get()?.n ?? 0
})
