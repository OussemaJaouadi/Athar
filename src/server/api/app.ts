import { createServerFn } from '@tanstack/react-start'

import { getDatabase } from '../db'
import { cleanEntry, displayRow } from '../pipeline/clean'
import type { RegistryRow } from '../pipeline/registry'
import { derivedSets, namesMatch, type VentureFilter, type WebsiteFilter } from './archive-sets'
import { readAsk } from './ask'
import { themesOf } from '../../shared/themes'

export type StartupRow = {
  id: string
  name: string
  description: string | null
  sector: string | null
  /** The month the startup was labelled, 'YYYY-MM'. */
  labelled: string | null
  creation_year: number | null
  website: string | null
}

export type SearchInput = {
  q?: string
  ask?: string
  sector?: string
  from?: number
  to?: number
  /** Year founded (creation_year). */
  founded?: number
  /** `yes`/`no`: listed or not. Otherwise what our last check of the website found. */
  website?: WebsiteFilter
  /** `founders`: the founders have another venture. `names`: the startup has another name. */
  ventures?: VentureFilter
  described?: 'yes' | 'no'
  /** 1-based page of PAGE_SIZE rows. Out of range is clamped to the last page. */
  page?: number
  /** With no page given, return the page that holds this startup, so a shared link lands on its row. */
  open?: string
}

export const PAGE_SIZE = 20

const COLUMNS = 's.id, COALESCE(s.display_name, s.name) AS name, s.description, s.sector, s.labelled, s.creation_year, s.website'
const LABELLED = 'CAST(substr(s.labelled, 1, 4) AS INTEGER)'

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
      .query<{ year: number; count: number }, []>(`SELECT ${LABELLED} AS year, COUNT(*) AS count FROM startups s WHERE labelled IS NOT NULL GROUP BY year ORDER BY year`)
      .all()
    const total = db.query<{ n: number }, []>('SELECT COUNT(*) AS n FROM startups').get()?.n ?? 0
    const foundedYears = db
      .query<{ year: number; count: number }, []>('SELECT creation_year AS year, COUNT(*) AS count FROM startups WHERE creation_year IS NOT NULL GROUP BY year ORDER BY year')
      .all()

    const read = data.ask ? readAsk(data.ask, sectors.map((s) => s.sector)) : null
    const f = { ...data, ...(read?.filters ?? {}) }
    const q = (f.q ?? '').trim()

    const where: string[] = []
    const params: Record<string, string | number> = {}
    if (f.sector) (where.push('s.sector = $sector'), (params.$sector = f.sector))
    if (f.from) (where.push(`${LABELLED} >= $from`), (params.$from = f.from))
    if (f.to) (where.push(`${LABELLED} <= $to`), (params.$to = f.to))
    if (f.founded) (where.push('s.creation_year = $founded'), (params.$founded = f.founded))
    const sets = derivedSets(db)
    const idsOf = (ids: Iterable<string>) => JSON.stringify([...ids])
    if (f.website === 'yes') where.push('s.website IS NOT NULL')
    else if (f.website === 'no') where.push('s.website IS NULL')
    else if (f.website) {
      where.push('s.id IN (SELECT value FROM json_each($siteIds))')
      params.$siteIds = idsOf([...sets.site].filter(([, state]) => state === f.website).map(([id]) => id))
    }
    if (f.ventures) {
      where.push('s.id IN (SELECT value FROM json_each($ventureIds))')
      params.$ventureIds = idsOf(f.ventures === 'founders' ? sets.founders : sets.names.keys())
    }
    if (f.described) where.push(f.described === 'yes' ? 's.description IS NOT NULL' : 's.description IS NULL')

    let from = 'startups s'
    // A total order: without the id tie-break, rows could repeat or vanish between pages.
    let order = 's.name COLLATE NOCASE, s.id'
    if (q) {
      // Words match the published name, description and sector (full text) and the startup's other names.
      const other = [...sets.names].filter(([, names]) => namesMatch(names, q)).map(([id]) => id)
      from = `startups s LEFT JOIN (SELECT startup_id, rank AS r FROM startups_fts WHERE startups_fts MATCH $q) m ON m.startup_id = s.id`
      where.unshift('(m.startup_id IS NOT NULL OR s.id IN (SELECT value FROM json_each($otherIds)))')
      params.$q = ftsAll(q)
      params.$otherIds = idsOf(other)
      order = 'm.r IS NULL, m.r, s.id'
    }
    const clause = where.length ? ` WHERE ${where.join(' AND ')}` : ''
    const matched = db.query<{ n: number }, typeof params>(`SELECT COUNT(*) AS n FROM ${from}${clause}`).get(params)?.n ?? 0
    const pages = Math.max(1, Math.ceil(matched / PAGE_SIZE))
    let page = Math.floor(f.page ?? 0)
    if (!page && f.open) {
      const at = db
        .query<{ n: number }, typeof params>(`SELECT n FROM (SELECT s.id, ROW_NUMBER() OVER (ORDER BY ${order}) AS n FROM ${from}${clause}) WHERE id = $open`)
        .get({ ...params, $open: f.open })?.n
      if (at) page = Math.ceil(at / PAGE_SIZE)
    }
    page = Math.min(pages, Math.max(1, page || 1))
    const rows = db.query<StartupRow, typeof params>(`SELECT ${COLUMNS} FROM ${from}${clause} ORDER BY ${order} LIMIT ${PAGE_SIZE} OFFSET ${(page - 1) * PAGE_SIZE}`).all(params)
    // How many startups each derived value holds, for the filter's choices.
    const states = [...sets.site.values()]
    const facets = {
      website: {
        yes: db.query<{ n: number }, []>('SELECT COUNT(*) AS n FROM startups WHERE website IS NOT NULL').get()?.n ?? 0,
        no: db.query<{ n: number }, []>('SELECT COUNT(*) AS n FROM startups WHERE website IS NULL').get()?.n ?? 0,
        answers: states.filter((x) => x === 'answers').length,
        moved: states.filter((x) => x === 'moved').length,
        parked: states.filter((x) => x === 'parked').length,
        silent: states.filter((x) => x === 'silent').length,
      },
      ventures: { founders: sets.founders.size, names: sets.names.size },
    }
    return { rows, matched, page, pages, sectors, years, foundedYears, total, read, facets }
  })

export type Change = { field: string; from: string | null; to: string | null; why: string }
/** Where a startup's values come from: the registry entry they were read from and what cleaning changed in it. */
export type ChainInfo = { entryId: string; changes: Change[] }
export type EntryInfo = { id: string; copies: number; firstSeen: string; lastSeen: string; primary: boolean }
export type StartupNote = { code: string; text: string }
export type WebsiteCheck = { status: 'reachable' | 'unreachable'; detail: string; final_host: string | null; checked_at: string; since: string }

const text = (v: unknown) => (v === null || v === undefined ? null : typeof v === 'string' ? v : Array.isArray(v) ? v.join(', ') : JSON.stringify(v))
// Registry field names to the startup's own, so a change lands on the fact it changed.
const FIELD: Record<string, string> = { desc: 'description', label: 'labelled' }

const parseRow = (json: string): RegistryRow | null => {
  try {
    return JSON.parse(json) as RegistryRow
  } catch {
    return null
  }
}

// Profile: the startup, the registry entries behind it, and what cleaning changed in the one its values come from.
export const getStartup = createServerFn()
  .validator((id: string) => id)
  .handler(async ({ data: id }) => {
    const db = getDatabase()
    const startup = db
      .query<
        StartupRow & {
          entry_id: string
          notes_json: string
          website_kind: string | null
          language: string | null
          domain: string | null
          first_download: number
          last_download: number
          created_at: string
        },
        [string]
      >('SELECT * FROM startups WHERE id = ?')
      .get(id)
    if (!startup) return null
    // Every listing the registry published for this startup, with when it was first and last seen.
    const entries = db
      .query<{ id: string; copies: number; raw_json: string; first_seen: string; last_seen: string }, [string]>(
        `SELECT e.id, e.copies, e.raw_json, d1.fetched_at AS first_seen, d2.last_checked_at AS last_seen
         FROM entries e JOIN downloads d1 ON d1.id = e.first_download JOIN downloads d2 ON d2.id = e.last_download
         WHERE e.startup_id = ? ORDER BY e.first_download, e.id`,
      )
      .all(id)
    const seen = db
      .query<{ first_seen: string; last_seen: string }, [number, number]>(
        'SELECT (SELECT fetched_at FROM downloads WHERE id = ?) AS first_seen, (SELECT last_checked_at FROM downloads WHERE id = ?) AS last_seen',
      )
      .get(startup.first_download, startup.last_download)
    // Withdrawn: the first download after the last one that still listed it.
    const gone = db
      .query<{ at: string }, [number]>('SELECT fetched_at AS at FROM downloads WHERE id > ? ORDER BY id LIMIT 1')
      .get(startup.last_download)
    // Changes are recomputed from the raw entry; a website field's extra text never leaves the server.
    const primary = entries.find((e) => e.id === startup.entry_id)
    const raw = primary ? parseRow(primary.raw_json) : null
    const shown = raw ? displayRow(raw) : null
    const chain: ChainInfo | null = raw
      ? {
          entryId: startup.entry_id,
          changes: cleanEntry(raw).changes.map((c) => ({
            field: FIELD[c.field] ?? c.field,
            from: text(c.field in (shown ?? {}) ? (shown as Record<string, unknown>)[c.field] : c.from),
            to: text(c.to),
            why: c.why,
          })),
        }
      : null
    const notes = JSON.parse(startup.notes_json) as StartupNote[]
    const founders = db.query<{ name: string }, [string]>('SELECT name FROM founders WHERE startup_id = ? ORDER BY position').all(id).map((f) => f.name)
    // The same people on other startups: matched on person_key, so one person under two spellings is one person.
    const alsoFounded = db
      .query<{ fn: string; id: string; name: string }, [string, string]>(
        `SELECT mine.name AS fn, s.id, COALESCE(s.display_name, s.name) AS name FROM founders mine
         JOIN founders other ON other.person_key = mine.person_key AND other.startup_id != mine.startup_id
         JOIN startups s ON s.id = other.startup_id
         WHERE mine.startup_id = ? AND s.id != ? ORDER BY mine.position, s.name`,
      )
      .all(id, id)
    // Our latest observation of the website: whether it answered, never a verdict on the company.
    const websiteCheck = db
      .query<WebsiteCheck, [string]>('SELECT status, detail, final_host, checked_at, since FROM website_checks WHERE startup_id = ?')
      .get(id)
    // Neighbours are facts, not guesses: same sector, closest labelling year first.
    const neighbours = startup.sector
      ? db
          .query<StartupRow, [string, string, string | null]>(
            `SELECT ${COLUMNS} FROM startups s WHERE s.sector = ? AND s.id != ?
             ORDER BY abs(CAST(substr(s.labelled, 1, 4) AS INTEGER) - CAST(substr(?, 1, 4) AS INTEGER)), s.name LIMIT 5`,
          )
          .all(startup.sector, id, startup.labelled)
      : []
    const { notes_json: _n, ...rest } = startup
    return {
      startup: { ...rest, founders },
      websiteCheck: websiteCheck ?? null,
      entries: entries.map((e): EntryInfo => ({ id: e.id, copies: e.copies, firstSeen: e.first_seen, lastSeen: e.last_seen, primary: e.id === startup.entry_id })),
      firstSeen: seen?.first_seen ?? null,
      lastSeen: seen?.last_seen ?? null,
      withdrawnSince: gone?.at ?? null,
      notes,
      chain,
      neighbours,
      alsoFounded,
    }
  })

export type WallTile = { id: string; name: string; sector: string | null; year: number | null; described: boolean }

// The wall: one tile per startup, in sector order, for the archive overview and the palette.
export const getWall = createServerFn().handler(async () => {
  return getDatabase()
    .query<{ id: string; name: string; sector: string | null; year: number | null; described: number }, []>(
      `SELECT id, COALESCE(display_name, name) AS name, sector, CAST(substr(labelled, 1, 4) AS INTEGER) AS year, description IS NOT NULL AS described
       FROM startups ORDER BY sector, year, name`,
    )
    .all()
    .map((t): WallTile => ({ ...t, described: t.described === 1 }))
})

export type LandscapeRow = {
  id: string
  name: string
  sector: string
  month: number
  year: number
  founded: number | null
  founders: number
  website: boolean
  described: boolean
  themes: string[]
}
export type RepeatFounder = { name: string; startups: { id: string; name: string; year: number }[] }

// Landscape: every labelled startup with what can be read from its row, small enough to send whole.
export const getLandscapeRows = createServerFn().handler(async () => {
  const db = getDatabase()
  const rows = db
    .query<{ id: string; name: string; sector: string; month: number; year: number; founded: number | null; founders: number; website: number; description: string | null }, []>(
      `SELECT id, COALESCE(display_name, name) AS name, sector, CAST(substr(labelled, 6, 2) AS INTEGER) AS month, CAST(substr(labelled, 1, 4) AS INTEGER) AS year,
              creation_year AS founded, (SELECT COUNT(*) FROM founders f WHERE f.startup_id = s.id) AS founders, website IS NOT NULL AS website, description
       FROM startups s WHERE sector IS NOT NULL AND labelled IS NOT NULL ORDER BY name COLLATE NOCASE`,
    )
    .all()
    .map(({ description, ...r }): LandscapeRow => ({ ...r, website: r.website === 1, described: !!description?.trim(), themes: themesOf(description) }))
  // People on two or more startups, by person_key: one person under two spellings counts once.
  const repeat = db
    .query<{ fn: string; ids: string }, []>(
      `WITH f AS (SELECT fo.startup_id AS id, fo.name AS fn, fo.person_key AS pk FROM founders fo JOIN startups s ON s.id = fo.startup_id WHERE s.labelled IS NOT NULL)
       SELECT min(fn) AS fn, json_group_array(DISTINCT id) AS ids FROM f GROUP BY pk HAVING count(DISTINCT id) > 1
       ORDER BY count(DISTINCT id) DESC, pk`,
    )
    .all()
  const byId = new Map(rows.map((r) => [r.id, r]))
  const founders: RepeatFounder[] = repeat.map((f) => ({
    name: f.fn,
    startups: (JSON.parse(f.ids) as string[]).map((id) => byId.get(id)).filter((r): r is LandscapeRow => !!r).map((r) => ({ id: r.id, name: r.name, year: r.year })),
  }))
  return { rows, founders }
})

// The corpus line shown in every reading-room page: what the archive holds and how fresh it is.
export const getCorpus = createServerFn().handler(async () => {
  const db = getDatabase()
  // The newest download: when the registry was downloaded, and when it was last checked unchanged.
  const snap = db
    .query<{ fetched_at: string; last_checked_at: string; row_count: number }, []>('SELECT fetched_at, last_checked_at, row_count FROM downloads ORDER BY id DESC LIMIT 1')
    .get()
  const startups = db.query<{ n: number }, []>('SELECT COUNT(*) AS n FROM startups').get()?.n ?? 0
  const embedded = db.query<{ n: number }, []>('SELECT COUNT(*) AS n FROM embedding_meta').get()?.n ?? 0
  return { startups, rows: snap?.row_count ?? 0, fetchedAt: snap?.fetched_at ?? null, checkedAt: snap?.last_checked_at ?? null, embedded }
})

export type RegistryCard = { id: string; name: string; sector: string | null; labelled: string | null; description: string | null }

const CARD_SQL = `SELECT s.id, COALESCE(s.display_name, s.name) AS name, s.sector, s.labelled, substr(s.description, 1, 320) AS description FROM startups s`

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
        `SELECT id, name, sector, labelled, description FROM (
           SELECT c.*, ROW_NUMBER() OVER (PARTITION BY c.sector ORDER BY length(c.description) DESC, c.name) AS k
           FROM (${CARD_SQL} WHERE s.description IS NOT NULL) c
         ) WHERE k <= ? ORDER BY k, sector`,
      )
      .all(per)
  })
