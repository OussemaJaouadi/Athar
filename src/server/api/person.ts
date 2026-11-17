import { createServerFn } from '@tanstack/react-start'

import { getDatabase } from '../db'
import type { WebsiteCheck } from '#/shared/website'

// The person page: one founder, whatever the spelling, and everything the data connects to them.
// A person exists only as a name on registry rows; the key ignores case, accents and word order.

/** "amami el salah" in the data, "amami-el-salah" in an address. */
export const personSlug = (personKey: string) => personKey.replace(/ /g, '-')
const keyOf = (slug: string) => slug.replace(/-/g, ' ')

/** Words written all in capitals: "Rayen CHERNI" has one. Between two spellings used as often, the calmer one is shown. */
const capitals = (name: string) => name.split(/\s+/).filter((w) => w.length > 1 && w === w.toUpperCase()).length

export type PersonStartup = {
  id: string; name: string; sector: string | null; labelled: string | null; description: string | null
  /** The name as written on this startup's registry row. */
  writtenAs: string
  check: WebsiteCheck | null
}
export type CoFounder = { name: string; slug: string; startups: { id: string; name: string }[] }

export const getPerson = createServerFn()
  .validator((slug: string) => slug)
  .handler(async ({ data: slug }) => {
    const db = getDatabase()
    const key = keyOf(slug)
    const rows = db
      .query<
        { id: string; name: string; sector: string | null; labelled: string | null; description: string | null; written: string
          status: 'reachable' | 'unreachable' | null; detail: string | null; final_host: string | null; checked_at: string | null; since: string | null },
        [string]
      >(
        `SELECT s.id, s.name, s.sector, s.labelled, s.description, f.name AS written, w.status, w.detail, w.final_host, w.checked_at, w.since
         FROM founders f JOIN startups s ON s.id = f.startup_id LEFT JOIN website_checks w ON w.startup_id = s.id
         WHERE f.person_key = ? ORDER BY s.labelled, s.name`,
      )
      .all(key)
    if (!rows.length) return null

    const startups: PersonStartup[] = rows.map((r) => ({
      id: r.id, name: r.name, sector: r.sector, labelled: r.labelled, description: r.description, writtenAs: r.written,
      check: r.status ? { status: r.status, detail: r.detail!, finalHost: r.final_host, checkedAt: r.checked_at!, since: r.since! } : null,
    }))
    // The spelling used most often is the name shown; the others are listed as written.
    const spellings = [...new Set(rows.map((r) => r.written))]
    const count = (s: string) => rows.filter((r) => r.written === s).length
    const name = [...spellings].sort((a, b) => count(b) - count(a) || capitals(a) - capitals(b))[0]

    // Founded with: everyone named beside this person, and on which startups.
    const beside = db
      .query<{ person_key: string; name: string; id: string; startup: string }, [string, string]>(
        `SELECT o.person_key, o.name, s.id, s.name AS startup FROM founders me JOIN founders o ON o.startup_id = me.startup_id AND o.person_key <> me.person_key
         JOIN startups s ON s.id = me.startup_id WHERE me.person_key = ? AND o.person_key <> ? ORDER BY s.labelled, o.position`,
      )
      .all(key, key)
    const byKey = new Map<string, CoFounder>()
    for (const b of beside) {
      const c = byKey.get(b.person_key) ?? { name: b.name, slug: personSlug(b.person_key), startups: [] }
      c.startups.push({ id: b.id, name: b.startup })
      byKey.set(b.person_key, c)
    }
    const foundedWith = [...byKey.values()].sort((a, b) => b.startups.length - a.startups.length || a.name.localeCompare(b.name))

    return { slug, name, spellings: spellings.filter((s) => s !== name), startups, foundedWith }
  })

export type PersonPage = NonNullable<Awaited<ReturnType<typeof getPerson>>>
