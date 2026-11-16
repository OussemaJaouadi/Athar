import { barX, barY, defineChart } from '@tanstack/charts'
import { Chart } from '@tanstack/charts/react'
import { scaleBand } from '@tanstack/charts/scales/band'
import { scaleLinear } from '@tanstack/charts/scales/linear'
import { tooltip } from '@tanstack/charts/tooltip'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useMemo } from 'react'

import { getLandscape } from '#/server/api/app'

export const Route = createFileRoute('/_app/landscape')({
  loader: () => getLandscape(),
  component: LandscapePage,
})

// Bars take the wall's manganese; the ink colour comes from the theme through currentColor.
const BAR = 'var(--color-zinc-700)'

// Landscape: two counts of the archive; every bar opens the startups behind it.
function LandscapePage() {
  const { byYear, bySector } = Route.useLoaderData()
  const navigate = useNavigate()

  const yearChart = useMemo(
    () =>
      defineChart({
        marks: [barY(byYear, { x: 'year', y: 'count', fill: BAR, inset: 2 })],
        scales: {
          x: { scale: () => scaleBand<string>().padding(0.2), axis: { label: 'Year labelled' } },
          y: { scale: scaleLinear, nice: true, grid: true, axis: { label: 'Startups' } },
        },
        tooltip,
      }),
    [byYear],
  )

  const sectorChart = useMemo(() => {
    const ranked = [...bySector].sort((a, b) => b.count - a.count)
    return defineChart({
      marks: [barX(ranked, { x: 'count', y: 'sector', fill: BAR, inset: 2 })],
      scales: {
        x: { scale: scaleLinear, nice: true, grid: true, axis: { label: 'Startups' } },
        y: { scale: () => scaleBand<string>().domain(ranked.map((r) => r.sector)).padding(0.2) },
      },
      tooltip,
    })
  }, [bySector])

  if (byYear.length === 0) {
    return (
      <main className="mx-auto max-w-6xl px-6 py-16">
        <h1 className="text-3xl font-semibold">Landscape</h1>
        <p className="mt-3 text-ink-2">Nothing to count yet. An operator runs Collect from the conservation lab.</p>
      </main>
    )
  }

  return (
    <main className="mx-auto grid max-w-6xl gap-10 px-6 py-10 text-ink">
      <header className="grid gap-2">
        <h1 className="text-3xl font-semibold">Landscape</h1>
        <p className="max-w-prose text-ink-2">Counts of what the registry holds. They describe the archive, not the market: a startup that was never labelled is not here.</p>
      </header>
      <section className="grid gap-3">
        <h2 className="text-lg font-semibold">Startups labelled each year</h2>
        <Chart definition={yearChart} height={280} initialWidth={960} ariaLabel="Startups labelled each year" />
      </section>
      <section className="grid gap-3">
        <h2 className="text-lg font-semibold">Startups per sector</h2>
        <p className="text-sm text-ink-2">Choose a bar to open its startups.</p>
        <Chart
          definition={sectorChart}
          height={Math.max(320, bySector.length * 26)}
          initialWidth={960}
          ariaLabel="Startups per sector"
          onSelect={(point) => point && navigate({ to: '/search', search: { sector: point.datum.sector } })}
        />
      </section>
    </main>
  )
}
