import { createServerFn } from '@tanstack/react-start'

import { AREAS } from '#/shared/areas'

/*
 * Areas: what registered startups do, grouped by words their descriptions share.
 * Hand-written until the archive is indexed; then groups by meaning replace these lists and nothing else changes.
 * A startup can sit in more than one area. "None" always means none in the registry, never that nobody tried.
 */
export const getAreas = createServerFn().handler(async () => {
  const { getDatabase } = await import('../db')
  const { areaMembers } = await import('../areas-query')
  const total = getDatabase().query<{ n: number }, []>('SELECT COUNT(*) AS n FROM startups').get()?.n ?? 0
  const inAny = new Set<string>()
  const areas = AREAS.map((a) => {
    const m = areaMembers(a)
    for (const x of m) inAny.add(x.id)
    const byYear = new Map<string, number>()
    for (const x of m) if (x.cohort) byYear.set(x.cohort.slice(3), (byYear.get(x.cohort.slice(3)) ?? 0) + 1)
    const ranked = [...byYear.entries()].sort((p, q) => q[1] - p[1] || q[0].localeCompare(p[0]))
    const latest = [...byYear.keys()].sort().at(-1) ?? null
    return { id: a.id, name: a.name, blurb: a.blurb, words: a.words, open: Boolean(a.open), count: m.length, busiest: ranked[0]?.[0] ?? null, latest, ids: m.map((x) => x.id), sample: m.slice(0, 5) }
  })
  return { total, areas, inNone: total - inAny.size }
})
