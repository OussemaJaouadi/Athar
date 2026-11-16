import { barX, barY, defineChart, text } from '@tanstack/charts'
import { Chart } from '@tanstack/charts/react'
import { scaleBand } from '@tanstack/charts/scales/band'
import { scaleLinear } from '@tanstack/charts/scales/linear'
import { tooltip } from '@tanstack/charts/tooltip'
import { Link, createFileRoute, getRouteApi, useNavigate } from '@tanstack/react-router'
import { useMemo } from 'react'

import { getLandscape } from '#/server/api/app'

const shell = getRouteApi('/_app')

export const Route = createFileRoute('/_app/landscape')({
  loader: () => getLandscape(),
  component: LandscapePage,
})

// Single-series counts take ochre, the data accent; green stays for actions.
const SLOT_A = 'var(--ochre)'
const SLOT_B = 'var(--ochre)'
const pct = (a: number, b: number) => Math.round((a / Math.max(1, b)) * 100)

// Landscape: what the registry holds, said in sentences first, then counted. Every bar and cell opens its startups.
function LandscapePage() {
  const { byYear, bySector, grid, facts } = Route.useLoaderData()
  const { wall } = shell.useLoaderData()
  const missing = wall.filter((t) => !t.described)
  const navigate = useNavigate()

  const yearChart = useMemo(
    () =>
      defineChart({
        marks: [
          barY(byYear, { x: 'year', y: 'count', fill: SLOT_A, inset: 6 }),
          text(byYear, { x: 'year', y: 'count', text: 'count', dy: -8, fontSize: 13, fill: 'currentColor' }),
        ],
        scales: { x: { scale: () => scaleBand<string>().padding(0.25) }, y: { scale: scaleLinear, nice: true } },
        tooltip,
      }),
    [byYear],
  )
  const sectorChart = useMemo(
    () =>
      defineChart({
        marks: [
          barX(bySector, { x: 'count', y: 'sector', fill: SLOT_B, inset: 3 }),
          text(bySector, { x: 'count', y: 'sector', text: 'count', dx: 8, anchor: 'start', fontSize: 13, fill: 'currentColor' }),
        ],
        scales: { x: { scale: scaleLinear, nice: true }, y: { scale: () => scaleBand<string>().domain(bySector.map((r) => r.sector)).padding(0.25) } },
        tooltip,
      }),
    [bySector],
  )

  if (!facts || facts.total === 0) {
    return (
      <main className="px-4 py-16 sm:px-10 lg:px-16">
        <h1 className="text-[1.75rem] leading-9">Nothing to count yet</h1>
        <p className="mt-2 text-ink-2">The registry has not been collected. An operator runs Collect first.</p>
      </main>
    )
  }

  const years = byYear.map((y) => y.year)
  const cell = new Map(grid.map((g) => [`${g.sector}|${g.year}`, g.count]))
  const peak = Math.max(...grid.map((g) => g.count), 1)
  const busiest = [...byYear].sort((a, b) => b.count - a.count)[0]
  const last = byYear[byYear.length - 1]

  return (
    <main className="max-w-[90rem] px-4 py-10 text-ink sm:px-10 lg:px-16 lg:py-14">
      <h1 className="text-[1.75rem] leading-9">Landscape</h1>
      <p className="mt-4 max-w-[62ch] font-display text-xl leading-8">
        {facts.total} startups from {facts.rows} registry rows. Labelling peaked in {busiest?.year} with {busiest?.count} startups and fell to {last?.count} in {last?.year}. {bySector[0]?.sector} is the largest sector, with {bySector[0]?.count}.
      </p>
      <p className="mt-3 max-w-[62ch] text-sm text-ink-2">
        {pct(facts.described, facts.total)}% describe what they do and {pct(facts.websites, facts.total)}% list a website. These counts describe the registry, not the market: a startup that was never labelled is not here.
      </p>

      <div className="mt-12 grid gap-x-16 gap-y-12 xl:grid-cols-2">
        <section aria-labelledby="y-h">
          <h2 id="y-h" className="text-xl">Startups labelled each year</h2>
          <p className="mt-1 mb-4 text-[0.8125rem] text-ink-2">Choose a year to see its startups.</p>
          <Chart definition={yearChart} height={320} initialWidth={640} ariaLabel="Startups labelled each year" onSelect={(p) => p && navigate({ to: '/search', search: { from: Number(p.datum.year), to: Number(p.datum.year) } })} />
        </section>
        <section aria-labelledby="s-h">
          <h2 id="s-h" className="text-xl">Startups per sector</h2>
          <p className="mt-1 mb-4 text-[0.8125rem] text-ink-2">Choose a sector to see its startups.</p>
          <Chart definition={sectorChart} height={Math.max(320, bySector.length * 24)} initialWidth={640} ariaLabel="Startups per sector" onSelect={(p) => p && navigate({ to: '/search', search: { sector: p.datum.sector } })} />
        </section>
      </div>

      <section aria-labelledby="w-h" className="mt-16">
        <h2 id="w-h" className="text-xl">
          {missing.length} of {wall.length} have no description
        </h2>
        <p className="mt-1 mb-5 text-[0.8125rem] text-ink-2">One tile per startup. An open tile is a startup the registry lists without saying what it does. Choose one to open it.</p>
        <div className="flex flex-wrap gap-[3px]">
          {wall.map((t) => (
            <Link
              key={t.id}
              to="/startups/$id"
              params={{ id: t.id }}
              title={t.described ? t.name : `${t.name}: no description`}
              aria-label={t.name}
              className={t.described ? 'size-2.5 bg-control/60 hover:bg-ink' : 'size-2.5 outline outline-1 -outline-offset-1 outline-ochre hover:bg-ochre'}
            />
          ))}
        </div>
        <Link to="/search" search={{ described: 'no' }} className="mt-4 inline-block text-sm">
          See the {missing.length} in the Archive
        </Link>
      </section>

      <section aria-labelledby="g-h" className="mt-16">
        <h2 id="g-h" className="text-xl">Each sector, year by year</h2>
        <p className="mt-1 mb-5 text-[0.8125rem] text-ink-2">Deeper ochre means more startups labelled; an open cell means none. Choose a cell to see them.</p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[44rem] border-separate border-spacing-[3px] text-sm">
            <thead>
              <tr>
                <th className="w-60" />
                {years.map((y) => (
                  <th key={y} className="pb-1 text-[0.8125rem] font-normal text-ink-2">{y}</th>
                ))}
                <th className="pb-1 text-[0.8125rem] font-normal text-ink-2">All</th>
              </tr>
            </thead>
            <tbody>
              {bySector.map((s) => (
                <tr key={s.sector}>
                  <th className="pe-3 text-start font-normal">{s.sector}</th>
                  {years.map((y) => {
                    const c = cell.get(`${s.sector}|${y}`) ?? 0
                    const t = c / peak
                    return (
                      <td key={y} className="p-0">
                        {c === 0 ? (
                          <span className="block h-8 rounded-[2px] outline outline-1 -outline-offset-1 outline-dashed outline-hairline" title={`${s.sector}, ${y}: none`} />
                        ) : (
                          <Link
                            to="/search"
                            search={{ sector: s.sector, from: Number(y), to: Number(y) }}
                            title={`${s.sector}, ${y}: ${c} startups`}
                            className="grid h-8 place-content-center rounded-[2px] text-[0.8125rem] no-underline"
                            style={{ background: `color-mix(in oklab, var(--ochre) ${Math.round(14 + t * 86)}%, var(--canvas))`, color: t > 0.5 ? 'var(--canvas)' : 'var(--ink)' }}
                          >
                            {c}
                          </Link>
                        )}
                      </td>
                    )
                  })}
                  <td className="text-center text-ink-2">{s.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  )
}
