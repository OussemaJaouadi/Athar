import { createServerFn } from '@tanstack/react-start'

import { getDatabase } from '../db'
import { cleanEntry, displayRow } from '../pipeline/clean'
import type { RegistryRow } from '../pipeline/registry'
import { similarToStartup } from '../pipeline/similar'
import type { WebsiteCheck } from '#/shared/website'

// The startup page: one startup and everything the data connects to it.
// Left, the record as the registry published it. Right, what stands around it: the same idea, the same people,
// the same sector and year.

/** Below this, two descriptions are about different things. Measured: unrelated ideas score about 0.5. */
const SAME_IDEA = 0.66
const SAME_IDEA_MAX = 8

type StartupRow = {
  id: string; entry_id: string; name: string; description: string | null; language: string | null; sector: string | null
  website: string | null; website_kind: string | null; labelled: string | null; creation_year: number | null
  notes_json: string; first_download: number; last_download: number
}
type CheckRow = { status: 'reachable' | 'unreachable'; detail: string; final_host: string | null; checked_at: string; since: string }

export type Neighbour = {
  id: string; name: string; sector: string | null; labelled: string | null; description: string | null
  /** null when the startup has no website of its own to ask. */
  check: WebsiteCheck | null
}
export type Person = { name: string; personKey: string; others: { id: string; name: string; sector: string | null; labelled: string | null }[] }
export type FieldChange = { field: string; from: string | null; to: string | null; why: string }

const toCheck = (c: CheckRow | null | undefined): WebsiteCheck | null =>
  c ? { status: c.status, detail: c.detail, finalHost: c.final_host, checkedAt: c.checked_at, since: c.since } : null
const shown = (v: unknown) => (v === null || v === undefined ? null : typeof v === 'string' ? v : Array.isArray(v) ? v.join(', ') : JSON.stringify(v))

export const getStartupPage = createServerFn()
  .validator((id: string) => id)
  .handler(async ({ data: id }) => {
    const db = getDatabase()
    const s = db.query<StartupRow, [string]>('SELECT * FROM startups WHERE id = ?').get(id)
    if (!s) return null

    // The source, said once: the registry row the values were read from, and when it was last published.
    const entry = db
      .query<{ raw_json: string; published: string }, [string]>(
        'SELECT e.raw_json, d.last_checked_at AS published FROM entries e JOIN downloads d ON d.id = e.last_download WHERE e.id = ?',
      )
      .get(s.entry_id)
    const listed = db.query<{ n: number }, [string, number]>('SELECT COALESCE(SUM(copies), 0) AS n FROM entries WHERE startup_id = ? AND last_download = ?').get(id, s.last_download)?.n ?? 1
    const withdrawn = db.query<{ at: string }, [number]>('SELECT fetched_at AS at FROM downloads WHERE id > ? ORDER BY id LIMIT 1').get(s.last_download)?.at ?? null

    // What cleaning changed, recomputed from the raw row. Text withheld from a website field never leaves the server.
    let changes: FieldChange[] = []
    if (entry) {
      const raw = JSON.parse(entry.raw_json) as RegistryRow
      const safe = displayRow(raw) as unknown as Record<string, unknown>
      changes = cleanEntry(raw).changes.map((c) => ({ field: c.field, from: shown(c.field in safe ? safe[c.field] : c.from), to: shown(c.to), why: c.why }))
    }

    const check = toCheck(db.query<CheckRow, [string]>('SELECT status, detail, final_host, checked_at, since FROM website_checks WHERE startup_id = ?').get(id))

    // Same people: each founder, and the other startups the same person founded, whatever the spelling.
    const other = db.query<{ id: string; name: string; sector: string | null; labelled: string | null }, [string, string]>(
      `SELECT s.id, s.name, s.sector, s.labelled FROM founders f JOIN startups s ON s.id = f.startup_id
       WHERE f.person_key = ? AND f.startup_id <> ? ORDER BY s.labelled, s.name`,
    )
    const people: Person[] = db
      .query<{ name: string; person_key: string }, [string]>('SELECT name, person_key FROM founders WHERE startup_id = ? ORDER BY position')
      .all(id)
      .map((f) => ({ name: f.name, personKey: f.person_key, others: other.all(f.person_key, id) }))

    // Same idea: the startups whose description is closest in meaning, oldest label first.
    const near = db.query<Omit<Neighbour, 'check'> & Partial<CheckRow>, [string]>(
      `SELECT s.id, s.name, s.sector, s.labelled, s.description, w.status, w.detail, w.final_host, w.checked_at, w.since
       FROM startups s LEFT JOIN website_checks w ON w.startup_id = s.id WHERE s.id = ?`,
    )
    const sameIdea: Neighbour[] = similarToStartup(db, id, SAME_IDEA_MAX)
      .filter((m) => m.similarity >= SAME_IDEA)
      .map((m) => near.get(m.startupId))
      .filter((r): r is NonNullable<typeof r> => !!r)
      .map((r) => ({ id: r.id, name: r.name, sector: r.sector, labelled: r.labelled, description: r.description, check: r.status ? toCheck(r as CheckRow) : null }))
      .sort((a, b) => (a.labelled ?? '').localeCompare(b.labelled ?? '') || a.name.localeCompare(b.name))
    const compared = db.query<{ n: number }, [string]>('SELECT COUNT(*) AS n FROM embedding_meta WHERE startup_id = ?').get(id)?.n === 1

    // Same sector, same year.
    const year = s.labelled?.slice(0, 4) ?? null
    const sectorTotal = s.sector ? (db.query<{ n: number }, [string]>('SELECT COUNT(*) AS n FROM startups WHERE sector = ?').get(s.sector)?.n ?? 0) : 0
    const cohort = s.sector && year
      ? db
          .query<{ id: string; name: string }, [string, string, string]>(
            "SELECT id, name FROM startups WHERE sector = ? AND substr(labelled, 1, 4) = ? AND id <> ? ORDER BY labelled, name",
          )
          .all(s.sector, year, id)
      : []

    return {
      startup: {
        id: s.id, name: s.name, description: s.description, language: s.language, sector: s.sector, website: s.website,
        websiteKind: s.website_kind, labelled: s.labelled, creationYear: s.creation_year,
      },
      source: { entryId: s.entry_id, published: entry?.published ?? null, listed, withdrawnSince: withdrawn },
      notes: (JSON.parse(s.notes_json) as { code: string; text: string }[]).filter((n) => !['no_description', 'listed_more_than_once'].includes(n.code) && !n.code.includes('website')),
      changes,
      check,
      people,
      sameIdea,
      /** false when the startup has no description, or Embed has not run: nothing to compare. */
      compared,
      sectorYear: { sector: s.sector, year, sectorTotal, others: cohort },
    }
  })

export type StartupPage = NonNullable<Awaited<ReturnType<typeof getStartupPage>>>
