import { Link, createFileRoute } from '@tanstack/react-router'

import { Scroller } from '@/components/athar/scroller'
import { TileMark } from '@/components/athar/tile-mark'
import { cn } from '@/lib/utils'
import { getLandscape, searchStartups } from '#/server/api/app'

type Search = { sector?: string; year?: number }

export const Route = createFileRoute('/_app/landscape')({
  validateSearch: (s: Record<string, unknown>): Search => ({
    sector: typeof s.sector === 'string' && s.sector ? s.sector : undefined,
    year: typeof s.year === 'number' ? s.year : typeof s.year === 'string' && /^\d{4}$/.test(s.year) ? Number(s.year) : undefined,
  }),
  loaderDeps: ({ search }) => search,
  loader: async ({ deps }) => {
    const land = await getLandscape()
    // Default selection: the largest sector, all years.
    const sector = deps.sector ?? (deps.year ? undefined : land.bySector[0]?.sector)
    const picked = await searchStartups({ data: { sector, from: deps.year, to: deps.year } })
    return { ...land, sector, year: deps.year, picked }
  },
  component: LandscapePage,
})

const pct = (a: number, b: number) => Math.round((a / Math.max(1, b)) * 100)

// Landscape: one table of sectors by year labelled. Any cell, row or year opens the startups behind it.
function LandscapePage() {
  const { byYear, bySector, grid, facts, sector, year, picked } = Route.useLoaderData()
  if (!facts || facts.total === 0) {
    return (
      <main className="px-4 py-16 sm:px-8">
        <h1 className="text-[2.75rem] leading-[3rem]">Nothing to count yet</h1>
        <p className="mt-2 text-ink-2">The registry has not been collected. An operator runs Collect first.</p>
      </main>
    )
  }

  const years = byYear.map((y) => Number(y.year))
  const cell = new Map(grid.map((g) => [`${g.sector}|${g.year}`, g.count]))
  const peak = Math.max(...grid.map((g) => g.count), 1)
  const busiest = [...byYear].sort((a, b) => b.count - a.count)[0]
  const last = byYear[byYear.length - 1]
  const top = bySector[0]?.count ?? 1
  const title = `${sector ?? 'All sectors'}, ${year ?? 'all years'}`
  const missing = facts.total - facts.described

  const shade = (c: number) => ({ background: `color-mix(in oklab, var(--ochre) ${Math.round(14 + (c / peak) * 86)}%, var(--canvas))`, color: c / peak > 0.5 ? 'var(--canvas)' : 'var(--ink)' })
  const isOn = (s?: string, y?: number) => s === sector && y === year

  return (
    <main className="grid flex-1 grid-cols-[minmax(0,1fr)] gap-x-12 px-4 py-10 sm:px-8 xl:grid-cols-12">
      <div className="xl:col-span-8">
        <h1 className="text-[2.75rem] leading-[3rem]">Landscape</h1>
        <p className="mt-4 max-w-[62ch] font-display text-xl leading-8">
          {facts.total} startups from {facts.rows} registry rows. Labelling peaked in {busiest?.year} with {busiest?.count} startups and fell to {last?.count} in {last?.year}. {bySector[0]?.sector} is the largest sector, with {bySector[0]?.count}.
        </p>
        <p className="mt-2 text-sm text-ink-2">These counts describe the registry, not the market: a startup that was never labelled is not here.</p>

        <div className="mt-10 overflow-x-auto">
          <table className="w-full min-w-[48rem] border-separate border-spacing-[3px] text-sm">
            <thead>
              <tr>
                <th className="w-64 pb-1 text-start text-xs font-normal text-ink-2">Sector · labelled</th>
                {years.map((y) => (
                  <th key={y} className="pb-1 font-normal">
                    <Link to="/landscape" search={{ year: y }} resetScroll={false} className={cn('font-mono text-xs no-underline', isOn(undefined, y) ? 'text-glaze' : 'text-ink-2 hover:text-ink')}>
                      {y}
                    </Link>
                  </th>
                ))}
                <th className="w-40 pb-1 text-end text-xs font-normal text-ink-2">All years</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th className="pe-3 text-start font-medium">
                  <Link to="/landscape" search={{ sector: undefined, year: undefined }} className="text-ink no-underline">
                    All sectors
                  </Link>
                </th>
                {byYear.map((y) => (
                  <td key={y.year} className="p-0">
                    <Link to="/landscape" search={{ year: Number(y.year) }} resetScroll={false} className={cn('grid h-9 place-content-center rounded-[2px] bg-surface-raised font-mono text-xs text-ink no-underline', isOn(undefined, Number(y.year)) && 'ring-2 ring-glaze')}>
                      {y.count}
                    </Link>
                  </td>
                ))}
                <td className="pe-1 text-end font-mono text-sm">{facts.total}</td>
              </tr>
              {bySector.map((s) => (
                <tr key={s.sector}>
                  <th className="pe-3 text-start font-normal">
                    <Link to="/landscape" search={{ sector: s.sector }} resetScroll={false} className={cn('no-underline', isOn(s.sector, undefined) ? 'text-glaze' : 'text-ink hover:text-glaze')}>
                      {s.sector}
                    </Link>
                  </th>
                  {years.map((y) => {
                    const c = cell.get(`${s.sector}|${y}`) ?? 0
                    return (
                      <td key={y} className="p-0">
                        {c === 0 ? (
                          <span className="block h-9 rounded-[2px] outline outline-1 -outline-offset-1 outline-dashed outline-hairline" title={`${s.sector}, ${y}: none`} />
                        ) : (
                          <Link
                            to="/landscape"
                            search={{ sector: s.sector, year: y }}
                            resetScroll={false}
                            title={`${s.sector}, ${y}: ${c}`}
                            className={cn('grid h-9 place-content-center rounded-[2px] font-mono text-xs no-underline', isOn(s.sector, y) && 'ring-2 ring-glaze')}
                            style={shade(c)}
                          >
                            {c}
                          </Link>
                        )}
                      </td>
                    )
                  })}
                  <td className="ps-3">
                    <span className="flex items-center justify-end gap-2">
                      <span className="h-1.5 bg-ochre/60" style={{ width: `${Math.round((s.count / top) * 80)}px` }} aria-hidden />
                      <span className="w-8 text-end font-mono text-sm">{s.count}</span>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mt-6 text-sm text-ink-2">
          {pct(facts.described, facts.total)}% describe what they do and {pct(facts.websites, facts.total)}% list a website.{' '}
          <Link to="/search" search={{ described: 'no' }}>
            See the {missing} without a description
          </Link>
        </p>
      </div>

      <aside aria-labelledby="sel-h" className="mt-12 flex min-h-0 flex-col xl:sticky xl:top-[4.5rem] xl:col-span-4 xl:mt-0 xl:h-[calc(100dvh-5.5rem)] xl:self-start">
        <h2 id="sel-h" className="text-[1.75rem] leading-9">
          {title}
        </h2>
        <p className="mt-1 text-sm text-ink-2">{picked.matched === 1 ? '1 startup' : `${picked.matched} startups`}</p>
        <Scroller className="mt-4 min-h-0 flex-1 border-t border-hairline" label={`Startups in ${title}`}>
          <ul>
            {picked.rows.map((r) => (
              <li key={r.id} className="border-b border-hairline">
                <Link to="/startups/$id" params={{ id: r.id }} className="grid h-10 grid-cols-[1.25rem_minmax(0,1fr)_auto] items-center gap-3 px-1 no-underline hover:bg-surface/60">
                  <TileMark id={r.id} sector={r.sector} size={20} />
                  <span className="truncate text-sm text-ink">{r.name}</span>
                  <span className="font-mono text-xs text-ink-2">{r.cohort?.slice(3)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Scroller>
        <p className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <Link to="/search" search={{ sector, from: year, to: year }}>
            {picked.matched > picked.rows.length ? `See all ${picked.matched} in the Archive` : 'Open them in the Archive'}
          </Link>
          {sector && (
            <Link to="/" search={{ draft: `${sector}: ` }}>
              Check an idea in {sector}
            </Link>
          )}
        </p>
      </aside>
    </main>
  )
}
