import { barX, defineChart, text } from '@tanstack/charts'
import { motion } from '@tanstack/charts/motion'
import { Chart } from '@tanstack/charts/react/core'
import { scaleBand } from '@tanstack/charts/scales/band'
import { scaleLinear } from '@tanstack/charts/scales/linear'
import { tooltip } from '@tanstack/charts/tooltip'
import { Link, useNavigate } from '@tanstack/react-router'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { useMemo } from 'react'

import { ChartSpace, axisText, chartTheme, useChartTokens, type ChartTokens } from '@/components/athar/chart-kit'
import { StateBars, StateKey } from '@/components/athar/state-bars'
import type { LabelYearPage, YearSector } from '#/server/api/year'
import { sectorSlug } from '#/shared/sector'

// The label year page, in the same form as the startup and sector pages: the record on the left,
// what the data says on the right. A year is every startup that received its label in it.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const pct = (a: number, b: number) => (b ? Math.round((100 * a) / b) : 0)
const ORDINAL = ['', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth']

const Heading = ({ children, count }: { children: React.ReactNode; count?: React.ReactNode }) => (
  <h2 className="font-sans text-sm font-medium tracking-[0.05em] uppercase">
    {children}
    {count !== undefined && <span className="ms-2 font-mono text-[0.8125rem] tracking-normal normal-case">{count}</span>}
  </h2>
)

/** The sectors of one year, largest first. Click a bar to open that sector and year. */
function SectorBars({ sectors, total, t, renderer, onPick }: { sectors: YearSector[]; total: number; t: ChartTokens | null; renderer: ReturnType<typeof motion>; onPick: (sector: string) => void }) {
  const height = 44 + sectors.length * 30
  const def = useMemo(() => {
    if (!t) return null
    return defineChart({
      marks: [
        barX(sectors, { id: 'sectors', x: 'labelled', y: 'sector', key: 'sector', fill: t.ochre, inset: 5 }),
        text(sectors, { x: 'labelled', y: 'sector', text: (s) => `${s.labelled}`, anchor: 'start', dx: 8, fontSize: 14, fill: t.ink }),
      ],
      scales: {
        x: { scale: scaleLinear, nice: true, grid: { stroke: t.hairline }, axis: axisText },
        y: { scale: () => scaleBand<string>().domain(sectors.map((s) => s.sector)).padding(0.1), axis: axisText },
      },
      tooltip: {
        use: tooltip,
        format: (point: { datum: unknown }) => {
          const s = point.datum as YearSector
          return `${s.sector}\n${s.labelled} of ${total} that year (${pct(s.labelled, total)}%)\nOver the whole registry: ${Math.round(s.usual)}%\nClick to open them`
        },
      },
      theme: chartTheme(t, [t.ochre]),
      margin: { left: 250, right: 40, top: 8 },
    })
  }, [t, total, JSON.stringify(sectors)]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!def) return <ChartSpace h={height} />
  return (
    <Chart
      definition={def}
      renderer={renderer}
      height={height}
      ariaLabel={`Startups labelled per sector. Largest: ${sectors[0]?.sector}, ${sectors[0]?.labelled}.`}
      onSelect={(pt) => {
        const sector = (pt?.datum as YearSector | undefined)?.sector
        if (sector) onPick(sector)
      }}
    />
  )
}

export function YearRecord({ data }: { data: LabelYearPage }) {
  const { year, total, registry, months, sectors, years, previous, next, noDescription, createdSameYear, registrySilentShare } = data
  const t = useChartTokens()
  const renderer = useMemo(() => motion({ transition: { type: 'spring', stiffness: 220, damping: 28, mass: 1 } }), [])
  const navigate = useNavigate()
  const y = Number(year)

  const bySize = [...years].sort((a, b) => b.labelled - a.labelled)
  const sizeRank = bySize.findIndex((x) => x.year === year) + 1
  const answers = months.reduce((n, m) => n + m.answers, 0)
  const silent = months.reduce((n, m) => n + m.silent, 0)
  const noSite = months.reduce((n, m) => n + m.noSite, 0)
  const asked = answers + silent
  const busiest = [...months].sort((a, b) => b.labelled - a.labelled)[0]
  const top = sectors[0]
  // The sector that took a larger part of this year than of the registry, by the widest margin.
  const lifted = [...sectors].filter((s) => s.labelled >= 3).sort((a, b) => pct(b.labelled, total) - b.usual - (pct(a.labelled, total) - a.usual))[0]

  const facts: [string, React.ReactNode][] = [
    [
      'Startups',
      <>
        <Link to="/search" search={{ from: y, to: y }}>
          {total}
        </Link>
        , {pct(total, registry)}% of the registry
      </>,
    ],
    [
      'Largest sector',
      top && (
        <>
          <Link to="/sectors/$slug" params={{ slug: sectorSlug(top.sector) }}>
            {top.sector}
          </Link>
          , {top.labelled}
        </>
      ),
    ],
    ['Websites today', asked ? `${answers} ${answers === 1 ? 'answers' : 'answer'}, ${silent} ${silent === 1 ? 'does' : 'do'} not${noSite ? `, ${noSite} ${noSite === 1 ? 'has' : 'have'} none` : ''}` : 'Not asked yet'],
    [
      'No description',
      noDescription ? (
        <>
          <Link to="/search" search={{ from: y, to: y, described: 'no' }}>
            {noDescription}
          </Link>{' '}
          of {total}
        </>
      ) : (
        'None'
      ),
    ],
    ['Created that year', `${createdSameYear} of ${total}; the others were created earlier`],
  ]

  return (
    <article className="grid items-start gap-x-12 gap-y-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <div className="grid gap-7 lg:sticky lg:top-6">
        <header className="grid gap-2.5">
          <div className="flex items-center gap-4">
            <h1 className="font-display text-[2.75rem] leading-[1.1] font-bold tabular-nums sm:text-[3.25rem]">{year}</h1>
            <nav aria-label="Label year" className="flex items-center gap-1.5">
              {previous ? (
                <Link to="/years/$year" params={{ year: previous }} aria-label={`${previous}, the year before`} className="grid size-9 place-items-center rounded-md border border-edge text-ink hover:bg-surface">
                  <ArrowLeft className="size-4" aria-hidden />
                </Link>
              ) : (
                <span aria-hidden className="grid size-9 place-items-center rounded-md border border-hairline text-ink-2">
                  <ArrowLeft className="size-4" />
                </span>
              )}
              {next ? (
                <Link to="/years/$year" params={{ year: next }} aria-label={`${next}, the year after`} className="grid size-9 place-items-center rounded-md border border-edge text-ink hover:bg-surface">
                  <ArrowRight className="size-4" aria-hidden />
                </Link>
              ) : (
                <span aria-hidden className="grid size-9 place-items-center rounded-md border border-hairline text-ink-2">
                  <ArrowRight className="size-4" />
                </span>
              )}
            </nav>
          </div>
          <p className="text-sm">
            A label year: every startup that received its label in {year}. The registry covers {years[0].year} to {years.at(-1)!.year}.
          </p>
        </header>
        <p className="max-w-[36ch] font-display text-[1.3125rem] leading-[1.42] text-pretty sm:text-[1.4375rem]">
          {total} startups were labelled in {year}, the {sizeRank === 1 ? 'most' : sizeRank === years.length ? 'fewest' : `${ORDINAL[sizeRank] ?? sizeRank + 'th'} most`} of any year.
          {noDescription > total / 2 && ` The registry describes only ${total - noDescription} of them.`}
        </p>
        <dl className="grid grid-cols-[max-content_minmax(0,1fr)] border-t border-edge">
          {facts
            .filter(([, value]) => value)
            .map(([label, value]) => (
              <div key={label} className="col-span-full grid grid-cols-subgrid border-b border-hairline">
                <dt className="py-2.5 pe-7 text-sm text-ink-2">{label}</dt>
                <dd className="py-2.5 font-normal tabular-nums">{value}</dd>
              </div>
            ))}
        </dl>
      </div>

      <div className="grid min-w-0 gap-9">
        <section className="grid min-w-0 gap-4">
          <Heading>Month by month</Heading>
          <div className="grid gap-2.5 border border-edge p-4 pb-2">
            <p className="text-[0.9375rem] font-normal">Startups labelled each month, by whether their website answers today.</p>
            <StateBars
              bars={months.map((m) => ({ key: String(m.month), label: MONTHS[m.month - 1], labelled: m.labelled, answers: m.answers, silent: m.silent, noSite: m.noSite }))}
              t={t}
              renderer={renderer}
              height={280}
              ariaLabel={`Startups labelled each month of ${year}. Most in ${MONTHS[busiest.month - 1]}: ${busiest.labelled}.`}
              title={(b) => `${b.label} ${year}: ${b.labelled} labelled`}
            />
            <StateKey />
          </div>
          {asked > 0 && (
            <p className="max-w-[64ch] text-base font-normal">
              {silent} of the {asked} websites do not answer today ({pct(silent, asked)}%)
              {registrySilentShare !== null && `, against ${Math.round(100 * registrySilentShare)}% across the registry`}. Labels came in batches: {busiest.labelled} in {MONTHS[busiest.month - 1]} alone
              {months.filter((m) => m.labelled === 0).length > 0 && `, none in ${months.filter((m) => m.labelled === 0).length} of the twelve months`}.
            </p>
          )}
        </section>

        <section className="grid min-w-0 gap-4">
          <Heading count={sectors.length}>Sectors that year</Heading>
          <div className="border border-edge p-4 pb-2">
            <SectorBars sectors={sectors} total={total} t={t} renderer={renderer} onPick={(sector) => navigate({ to: '/search', search: { sector, from: y, to: y } })} />
          </div>
          {lifted && pct(lifted.labelled, total) - lifted.usual >= 3 && (
            <p className="max-w-[64ch] text-base font-normal">
              <Link to="/sectors/$slug" params={{ slug: sectorSlug(lifted.sector) }}>
                {lifted.sector}
              </Link>{' '}
              took {pct(lifted.labelled, total)}% of this year's labels, against {Math.round(lifted.usual)}% of the registry as a whole.
            </p>
          )}
        </section>
      </div>
    </article>
  )
}
