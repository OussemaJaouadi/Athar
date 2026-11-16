import { barX, barY, defineChart } from '@tanstack/charts'
import { Chart } from '@tanstack/charts/react'
import { scaleBand } from '@tanstack/charts/scales/band'
import { scaleLinear } from '@tanstack/charts/scales/linear'
import { tooltip } from '@tanstack/charts/tooltip'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { useMemo } from 'react'

import { Panel, Stat } from '@/components/athar/kit'
import { getLandscape } from '#/server/api/app'

export const Route = createFileRoute('/_app/landscape')({
  loader: () => getLandscape(),
  component: LandscapePage,
})

// Bars take the wall's manganese; the ink colour comes from the theme through currentColor.
const BAR = 'var(--color-zinc-700)'
const pct = (a: number, b: number) => `${Math.round((a / Math.max(1, b)) * 100)}%`

// Landscape: what the archive holds, counted. Every bar and cell opens the startups behind it.
function LandscapePage() {
  const { byYear, bySector, grid, facts } = Route.useLoaderData()
  const navigate = useNavigate()

  const yearChart = useMemo(
    () =>
      defineChart({
        marks: [barY(byYear, { x: 'year', y: 'count', fill: BAR, inset: 2 })],
        scales: {
          x: { scale: () => scaleBand<string>().padding(0.25) },
          y: { scale: scaleLinear, nice: true, grid: true },
        },
        tooltip,
      }),
    [byYear],
  )
  const sectorChart = useMemo(
    () =>
      defineChart({
        marks: [barX(bySector, { x: 'count', y: 'sector', fill: BAR, inset: 2 })],
        scales: {
          x: { scale: scaleLinear, nice: true, grid: true },
          y: { scale: () => scaleBand<string>().domain(bySector.map((r) => r.sector)).padding(0.2) },
        },
        tooltip,
      }),
    [bySector],
  )

  if (!facts || facts.total === 0) {
    return (
      <main className="px-4 py-16 sm:px-6 lg:px-8">
        <h1 className="text-2xl font-semibold">Nothing to count yet</h1>
        <p className="mt-2 text-ink-2">An operator runs Collect from the conservation lab.</p>
      </main>
    )
  }

  const years = byYear.map((y) => y.year)
  const cell = new Map(grid.map((g) => [`${g.sector}|${g.year}`, g.count]))
  const peak = Math.max(...grid.map((g) => g.count), 1)
  const busiest = [...byYear].sort((a, b) => b.count - a.count)[0]

  return (
    <main className="grid grid-cols-[minmax(0,1fr)] gap-5 px-4 py-5 text-ink sm:px-6 lg:px-8">
      <div className="grid gap-1">
        <p className="font-mono text-[0.6875rem] tracking-wide text-ink-2 uppercase">Landscape</p>
        <h1 className="text-2xl font-semibold">The archive, counted</h1>
        <p className="max-w-3xl text-sm text-ink-2">These counts describe the registry, not the market: a startup that was never labelled is not here.</p>
      </div>

      <div className="grid grid-cols-2 gap-px border border-hairline bg-hairline md:grid-cols-5">
        <Stat label="Startups" value={facts.total} note={`from ${facts.rows} registry rows`} />
        <Stat label="Sectors" value={bySector.length} note={`largest: ${bySector[0]?.sector}`} />
        <Stat label="Busiest year" value={busiest?.year} note={`${busiest?.count} labelled`} />
        <Stat label="Described" value={pct(facts.described, facts.total)} note={`${facts.total - facts.described} with no description`} />
        <Stat label="Founding → label" value={`${(facts.lag ?? 0).toFixed(1)} y`} note={`${pct(facts.websites, facts.total)} list a website`} />
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Panel title="Labelled each year" meta="choose a bar">
          <Chart
            definition={yearChart}
            height={300}
            initialWidth={640}
            ariaLabel="Startups labelled each year"
            onSelect={(p) => p && navigate({ to: '/search', search: { from: Number(p.datum.year), to: Number(p.datum.year) } })}
          />
        </Panel>
        <Panel title="Per sector" meta="choose a bar">
          <Chart
            definition={sectorChart}
            height={Math.max(300, bySector.length * 19)}
            initialWidth={640}
            ariaLabel="Startups per sector"
            onSelect={(p) => p && navigate({ to: '/search', search: { sector: p.datum.sector } })}
          />
        </Panel>
      </div>

      <Panel title="Sector by year labelled" meta="darker means more startups · choose a cell" bodyClassName="overflow-x-auto p-4">
        <table className="w-full min-w-[40rem] border-separate border-spacing-[3px] text-xs">
          <thead>
            <tr>
              <th className="w-56" />
              {years.map((y) => (
                <th key={y} className="font-mono text-[0.6875rem] font-normal text-ink-2">{y}</th>
              ))}
              <th className="font-mono text-[0.6875rem] font-normal text-ink-2">all</th>
            </tr>
          </thead>
          <tbody>
            {bySector.map((s) => (
              <tr key={s.sector}>
                <th className="truncate pe-2 text-start font-normal text-ink-2">{s.sector}</th>
                {years.map((y) => {
                  const c = cell.get(`${s.sector}|${y}`) ?? 0
                  return (
                    <td key={y} className="p-0">
                      {c === 0 ? (
                        <span className="block h-7 outline outline-1 -outline-offset-1 outline-dashed outline-zinc-300" title={`${s.sector}, ${y}: none`} />
                      ) : (
                        <Link
                          to="/search"
                          search={{ sector: s.sector, from: Number(y), to: Number(y) }}
                          title={`${s.sector}, ${y}: ${c}`}
                          className="grid h-7 place-content-center font-mono text-[0.6875rem] no-underline"
                          style={{
                            background: `color-mix(in oklab, var(--color-zinc-800) ${Math.round(12 + (c / peak) * 88)}%, var(--canvas))`,
                            color: c / peak > 0.45 ? 'var(--color-zinc-50)' : 'var(--ink)',
                          }}
                        >
                          {c}
                        </Link>
                      )}
                    </td>
                  )
                })}
                <td className="text-center font-mono text-[0.6875rem] tabular-nums">{s.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </main>
  )
}
