import { createServerFn } from '@tanstack/react-start'

import { getDatabase } from '../db'

// The label year page: everyone who received the label in one year, in which sectors, and what is left of them today.

export type YearMonth = { month: number; labelled: number; answers: number; silent: number; noSite: number }
export type YearSector = { sector: string; labelled: number; /** The sector's share of the whole registry, in percent. */ usual: number }

export const getLabelYear = createServerFn()
  .validator((year: string) => year)
  .handler(async ({ data: year }) => {
    const db = getDatabase()
    const all = db.query<{ year: string; n: number }, []>("SELECT substr(labelled, 1, 4) AS year, COUNT(*) AS n FROM startups WHERE labelled IS NOT NULL GROUP BY 1 ORDER BY 1").all()
    const at = all.findIndex((y) => y.year === year)
    if (at < 0) return null
    const total = all[at].n
    const registry = all.reduce((n, y) => n + y.n, 0)

    const byMonth = new Map(
      db
        .query<{ month: number; labelled: number; answers: number; silent: number }, [string]>(
          `SELECT CAST(substr(s.labelled, 6, 2) AS INTEGER) AS month, COUNT(*) AS labelled,
                  COALESCE(SUM(w.status = 'reachable'), 0) AS answers, COALESCE(SUM(w.status = 'unreachable'), 0) AS silent
           FROM startups s LEFT JOIN website_checks w ON w.startup_id = s.id WHERE substr(s.labelled, 1, 4) = ? GROUP BY 1`,
        )
        .all(year)
        .map((m) => [m.month, m]),
    )
    const months: YearMonth[] = Array.from({ length: 12 }, (_, i) => {
      const m = byMonth.get(i + 1)
      return { month: i + 1, labelled: m?.labelled ?? 0, answers: m?.answers ?? 0, silent: m?.silent ?? 0, noSite: m ? m.labelled - m.answers - m.silent : 0 }
    })

    const sectors: YearSector[] = db
      .query<{ sector: string; labelled: number; overall: number }, [string]>(
        `SELECT sector, SUM(substr(labelled, 1, 4) = ?) AS labelled, COUNT(*) AS overall FROM startups WHERE sector IS NOT NULL GROUP BY sector`,
      )
      .all(year)
      .filter((s) => s.labelled > 0)
      .map((s) => ({ sector: s.sector, labelled: s.labelled, usual: (100 * s.overall) / registry }))
      .sort((a, b) => b.labelled - a.labelled || a.sector.localeCompare(b.sector))

    const facts = db
      .query<{ no_description: number; same_year: number; known_creation: number }, [number, string]>(
        `SELECT SUM(description IS NULL) AS no_description, SUM(creation_year = ?) AS same_year, SUM(creation_year IS NOT NULL) AS known_creation
         FROM startups WHERE substr(labelled, 1, 4) = ?`,
      )
      .get(Number(year), year)
    const checked = db.query<{ asked: number; silent: number }, []>("SELECT COUNT(*) AS asked, COALESCE(SUM(status = 'unreachable'), 0) AS silent FROM website_checks").get()

    return {
      year, total, registry, months, sectors,
      years: all.map((y) => ({ year: y.year, labelled: y.n })),
      previous: all[at - 1]?.year ?? null,
      next: all[at + 1]?.year ?? null,
      noDescription: facts?.no_description ?? 0,
      createdSameYear: facts?.same_year ?? 0,
      registrySilentShare: checked?.asked ? checked.silent / checked.asked : null,
    }
  })

export type LabelYearPage = NonNullable<Awaited<ReturnType<typeof getLabelYear>>>
