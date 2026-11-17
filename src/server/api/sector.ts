import { createServerFn } from '@tanstack/react-start'

import { getDatabase } from '../db'
import { sectorSlug } from '#/shared/sector'

// The sector page: one of the registry's sectors, how it moved over the label years, and what is left of it today.

export type SectorYear = {
  year: string
  labelled: number
  /** Of those labelled that year: website answers today, does not answer, and no website of its own to ask. */
  answers: number
  silent: number
  noSite: number
  /** Every startup labelled that year, all sectors. */
  yearTotal: number
}
export type SectorPerson = { name: string; slug: string; startups: { id: string; name: string; inSector: boolean }[] }

export const getSector = createServerFn()
  .validator((slug: string) => slug)
  .handler(async ({ data: slug }) => {
    const db = getDatabase()
    const sizes = db.query<{ sector: string; n: number }, []>('SELECT sector, COUNT(*) AS n FROM startups WHERE sector IS NOT NULL GROUP BY sector ORDER BY n DESC, sector').all()
    const rank = sizes.findIndex((s) => sectorSlug(s.sector) === slug)
    if (rank < 0) return null
    const { sector, n: total } = sizes[rank]
    const registry = db.query<{ n: number }, []>('SELECT COUNT(*) AS n FROM startups').get()?.n ?? 0

    const allYears = db.query<{ year: string; n: number }, []>("SELECT substr(labelled, 1, 4) AS year, COUNT(*) AS n FROM startups WHERE labelled IS NOT NULL GROUP BY 1 ORDER BY 1").all()
    const mine = new Map(
      db
        .query<{ year: string; labelled: number; answers: number; silent: number }, [string]>(
          `SELECT substr(s.labelled, 1, 4) AS year, COUNT(*) AS labelled,
                  COALESCE(SUM(w.status = 'reachable'), 0) AS answers, COALESCE(SUM(w.status = 'unreachable'), 0) AS silent
           FROM startups s LEFT JOIN website_checks w ON w.startup_id = s.id WHERE s.sector = ? AND s.labelled IS NOT NULL GROUP BY 1`,
        )
        .all(sector)
        .map((r) => [r.year, r]),
    )
    // Every label year of the registry, so a year with nothing is shown as nothing.
    const years: SectorYear[] = allYears.map((y) => {
      const m = mine.get(y.year)
      return { year: y.year, labelled: m?.labelled ?? 0, answers: m?.answers ?? 0, silent: m?.silent ?? 0, noSite: m ? m.labelled - m.answers - m.silent : 0, yearTotal: y.n }
    })

    const noDescription = db.query<{ n: number }, [string]>('SELECT COUNT(*) AS n FROM startups WHERE sector = ? AND description IS NULL').get(sector)?.n ?? 0
    const checked = db.query<{ asked: number; silent: number }, []>("SELECT COUNT(*) AS asked, COALESCE(SUM(status = 'unreachable'), 0) AS silent FROM website_checks").get()

    // People named on a startup of this sector and on at least one other startup, in any sector.
    const rows = db
      .query<{ person_key: string; name: string; id: string; startup: string; sector: string | null }, [string]>(
        `SELECT f.person_key, f.name, s.id, s.name AS startup, s.sector FROM founders f JOIN startups s ON s.id = f.startup_id
         WHERE f.person_key IN (SELECT f2.person_key FROM founders f2 JOIN startups s2 ON s2.id = f2.startup_id WHERE s2.sector = ?)
           AND f.person_key IN (SELECT person_key FROM founders GROUP BY person_key HAVING COUNT(DISTINCT startup_id) > 1)
         ORDER BY s.labelled, s.name`,
      )
      .all(sector)
    const byKey = new Map<string, SectorPerson>()
    for (const r of rows) {
      const p = byKey.get(r.person_key) ?? { name: r.name, slug: r.person_key.replace(/ /g, '-'), startups: [] }
      if (!p.startups.some((s) => s.id === r.id)) p.startups.push({ id: r.id, name: r.startup, inSector: r.sector === sector })
      byKey.set(r.person_key, p)
    }
    const people = [...byKey.values()].sort((a, b) => b.startups.length - a.startups.length || a.name.localeCompare(b.name))

    return {
      slug, sector, total, registry, rank: rank + 1, sectors: sizes.length, years, noDescription, people,
      /** Share of all checked websites, every sector, that do not answer today. */
      registrySilentShare: checked?.asked ? checked.silent / checked.asked : null,
    }
  })

export type SectorPage = NonNullable<Awaited<ReturnType<typeof getSector>>>
