import { barY, defineChart, ruleY, text } from '@tanstack/charts'
import { crosshair } from '@tanstack/charts/crosshair'
import { motion } from '@tanstack/charts/motion'
import { Chart } from '@tanstack/charts/react/core'
import { scaleBand } from '@tanstack/charts/scales/band'
import { scaleLinear } from '@tanstack/charts/scales/linear'
import { tooltip } from '@tanstack/charts/tooltip'
import { Link, useNavigate } from '@tanstack/react-router'
import { useMemo } from 'react'

import { ChartSpace, axisText, chartTheme, useChartTokens, type ChartTokens } from '@/components/athar/chart-kit'
import type { SectorPage, SectorYear } from '#/server/api/sector'

// The sector page, in the form picked for the startup page: the record on the left, what the data says on the right.
// Two charts share the label years (the owner's pick, 17 Nov 2026): how many and what is left, then its share of each year.

const pct = (a: number, b: number) => (b ? Math.round((100 * a) / b) : 0)
const share = (a: number, b: number) => (pct(a, b) < 1 ? 'under 1%' : `${pct(a, b)}%`)
const ORDINAL = ['', 'largest', 'second largest', 'third largest', 'fourth largest', 'fifth largest']
const place = (rank: number, of: number) => (rank === of ? 'smallest' : (ORDINAL[rank] ?? `${rank}th largest`))

const Heading = ({ children, count }: { children: React.ReactNode; count?: React.ReactNode }) => (
  <h2 className="font-sans text-sm font-medium tracking-[0.05em] uppercase">
    {children}
    {count !== undefined && <span className="ms-2 font-mono text-[0.8125rem] tracking-normal normal-case">{count}</span>}
  </h2>
)

type Part = { year: string; state: 'answers' | 'silent' | 'noSite'; count: number }
const STATE_LABEL = { answers: 'Website answers', silent: 'Does not answer', noSite: 'No website' } as const

/** Startups labelled each year, stacked by what their website does today. Filled, open, dashed: the same marks as the records. */
function LeftChart({ years, t, renderer, onYear }: { years: SectorYear[]; t: ChartTokens | null; renderer: ReturnType<typeof motion>; onYear: (year: string) => void }) {
  const def = useMemo(() => {
    if (!t) return null
    const parts: Part[] = years.flatMap((y) => [
      { year: y.year, state: 'answers' as const, count: y.answers },
      { year: y.year, state: 'silent' as const, count: y.silent },
      { year: y.year, state: 'noSite' as const, count: y.noSite },
    ])
    return defineChart({
      marks: [
        crosshair({ x: { band: { inset: 0, fill: t.ink, fillOpacity: 0.06 }, label: false }, y: false }),
        barY(parts, {
          id: 'labelled',
          x: 'year',
          y: 'count',
          z: 'state',
          key: (p) => `${p.year}-${p.state}`,
          fill: (p) => (p.state === 'answers' ? t.ink : t.canvas),
          stroke: (p) => (p.state === 'noSite' ? t.ink2 : t.ink),
          strokeWidth: 1.5,
          strokeDasharray: (p) => (p.state === 'noSite' ? '3 3' : ''),
          inset: 10,
        }),
        text(years.filter((y) => y.labelled > 0), { x: 'year', y: 'labelled', text: (y) => String(y.labelled), dy: -10, fontSize: 14, fill: t.ink }),
      ],
      scales: {
        x: { scale: () => scaleBand<string>().domain(years.map((y) => y.year)).padding(0.1), axis: axisText },
        y: { scale: scaleLinear, nice: true, grid: { stroke: t.hairline }, axis: axisText },
      },
      focus: 'group-x',
      maxFocusDistance: Number.POSITIVE_INFINITY,
      tooltip: {
        use: tooltip,
        formatGroup: (points: readonly { datum: unknown }[]) => {
          const y = years.find((x) => x.year === (points[0]?.datum as { year?: string } | undefined)?.year)
          if (!y) return ''
          return [`Labelled in ${y.year}: ${y.labelled}`, `${STATE_LABEL.answers}: ${y.answers}`, `${STATE_LABEL.silent}: ${y.silent}`, y.noSite ? `${STATE_LABEL.noSite}: ${y.noSite}` : null, 'Click to open them'].filter(Boolean).join('\n')
        },
      },
      theme: chartTheme(t, [t.ink]),
      margin: { left: 40, top: 24 },
    })
  }, [t, JSON.stringify(years)]) // eslint-disable-line react-hooks/exhaustive-deps
  const peak = [...years].sort((a, b) => b.labelled - a.labelled)[0]
  if (!def) return <ChartSpace h={300} />
  return (
    <Chart
      definition={def}
      renderer={renderer}
      height={300}
      ariaLabel={`Startups labelled each year, by whether their website answers today. Most in ${peak.year}: ${peak.labelled}, of which ${peak.silent} do not answer.`}
      onSelect={(pt) => {
        const year = (pt?.datum as { year?: string } | undefined)?.year
        if (year) onYear(year)
      }}
    />
  )
}

/** The sector's share of every label granted each year, against its share of the whole registry. */
function ShareChart({ years, overall, t, renderer }: { years: SectorYear[]; overall: number; t: ChartTokens | null; renderer: ReturnType<typeof motion> }) {
  const def = useMemo(() => {
    if (!t) return null
    const rows = years.map((y) => ({ year: y.year, share: y.yearTotal ? (100 * y.labelled) / y.yearTotal : 0, labelled: y.labelled, yearTotal: y.yearTotal }))
    return defineChart({
      marks: [
        crosshair({ x: { band: { inset: 0, fill: t.ink, fillOpacity: 0.06 }, label: false }, y: false }),
        ruleY([overall], { stroke: t.ink, strokeWidth: 1.5, strokeDasharray: '6 4' }),
        barY(rows, { id: 'share', x: 'year', y: 'share', key: 'year', fill: t.ochre, inset: 10 }),
        text(rows.filter((r) => r.labelled > 0), { x: 'year', y: 'share', text: (r) => `${Math.round(r.share)}%`, dy: -10, fontSize: 14, fill: t.ink }),
      ],
      scales: {
        x: { scale: () => scaleBand<string>().domain(rows.map((r) => r.year)).padding(0.1), axis: axisText },
        y: { scale: scaleLinear, nice: true, grid: { stroke: t.hairline }, axis: { ...axisText, ticks: { format: (v: number) => `${v}%` } } },
      },
      focus: 'group-x',
      maxFocusDistance: Number.POSITIVE_INFINITY,
      tooltip: {
        use: tooltip,
        formatGroup: (points: readonly { datum: unknown }[]) => {
          const r = rows.find((x) => x.year === (points[0]?.datum as { year?: string } | undefined)?.year)
          return r ? `${r.year}\n${r.labelled} of the ${r.yearTotal} startups labelled that year\n${r.share.toFixed(1)}%` : ''
        },
      },
      theme: chartTheme(t, [t.ochre]),
      margin: { left: 48, top: 24 },
    })
  }, [t, overall, JSON.stringify(years)]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!def) return <ChartSpace h={260} />
  return <Chart definition={def} renderer={renderer} height={260} ariaLabel={`Share of each year's labels. Over the whole registry it is ${Math.round(overall)}%.`} />
}

const Key = ({ items }: { items: [string, string][] }) => (
  <ul className="flex flex-wrap gap-x-6 gap-y-1.5 text-sm">
    {items.map(([label, mark]) => (
      <li key={label} className="flex items-center gap-2">
        <span aria-hidden className={`inline-block size-3 shrink-0 ${mark}`} />
        {label}
      </li>
    ))}
  </ul>
)

export function SectorRecord({ data }: { data: SectorPage }) {
  const { sector, total, registry, rank, sectors, years, noDescription, people, registrySilentShare } = data
  const t = useChartTokens()
  const renderer = useMemo(() => motion({ transition: { type: 'spring', stiffness: 220, damping: 28, mass: 1 } }), [])
  const navigate = useNavigate()

  const active = years.filter((y) => y.labelled > 0)
  const peak = [...years].sort((a, b) => b.labelled - a.labelled)[0]
  const recent = years.slice(-3)
  const recentCount = recent.reduce((n, y) => n + y.labelled, 0)
  const answers = years.reduce((n, y) => n + y.answers, 0)
  const silent = years.reduce((n, y) => n + y.silent, 0)
  const noSite = years.reduce((n, y) => n + y.noSite, 0)
  const asked = answers + silent
  const overall = (100 * total) / registry
  const repeat = people

  const facts: [string, React.ReactNode][] = [
    [
      'Startups',
      <>
        <Link to="/search" search={{ sector }}>
          {total}
        </Link>
        , {share(total, registry)} of the registry
      </>,
    ],
    ['Labelled', active.length ? `${active[0].year} to ${active.at(-1)!.year}, most in ${peak.year}` : null],
    ['Websites today', asked + noSite > 0 ? (asked ? `${answers} ${answers === 1 ? 'answers' : 'answer'}, ${silent} ${silent === 1 ? 'does' : 'do'} not${noSite ? `, ${noSite} ${noSite === 1 ? 'has' : 'have'} none` : ''}` : 'Not asked yet') : null],
    [
      'No description',
      noDescription ? (
        <Link to="/search" search={{ sector, described: 'no' }}>
          {noDescription}
        </Link>
      ) : (
        'None'
      ),
    ],
  ]

  return (
    <article className="grid items-start gap-x-12 gap-y-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <div className="grid gap-7 lg:sticky lg:top-6">
        <header className="grid gap-2.5">
          <h1 className="font-display text-[2.125rem] leading-[1.1] font-bold text-balance sm:text-[2.75rem]">{sector}</h1>
          <p className="text-sm">
            A sector as the registry names it: the {place(rank, sectors)} of {sectors}.
          </p>
        </header>
        <p className="max-w-[36ch] font-display text-[1.3125rem] leading-[1.42] text-pretty sm:text-[1.4375rem]">
          {peak.labelled >= 5
            ? `It peaked in ${peak.year} with ${peak.labelled} labels, ${share(peak.labelled, peak.yearTotal)} of that year's. In ${recent[0].year} to ${recent.at(-1)!.year} it had ${recentCount === 0 ? 'none' : recentCount}.`
            : `${total === 1 ? 'One startup' : `${total} startups`} in ${active.length === 1 ? 'one year' : `${active.length} years`}, never more than ${peak.labelled} in a year.`}
        </p>
        <dl className="grid grid-cols-[max-content_minmax(0,1fr)] border-t border-edge">
          {facts
            .filter(([, value]) => value !== null)
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
          <Heading>Over the years</Heading>

          <div className="grid gap-2.5 border border-edge p-4 pb-2">
            <p className="text-[0.9375rem] font-normal">Startups labelled each year, by whether their website answers today.</p>
            <LeftChart years={years} t={t} renderer={renderer} onYear={(year) => navigate({ to: '/search', search: { sector, from: Number(year), to: Number(year) } })} />
            <Key
              items={[
                [STATE_LABEL.answers, 'bg-ink'],
                [STATE_LABEL.silent, 'border-[1.5px] border-ink'],
                [STATE_LABEL.noSite, 'border-[1.5px] border-dashed border-ink-2'],
              ]}
            />
          </div>
          {asked > 0 && (
            <p className="max-w-[64ch] text-base font-normal">
              {peak.labelled >= 5 && `Of the ${peak.labelled} startups labelled in ${peak.year}, ${peak.silent} ${peak.silent === 1 ? 'has' : 'have'} a website that does not answer today. `}
              {peak.labelled >= 5 ? 'Across all years it is' : 'Websites that do not answer today:'} {silent} of {asked} ({pct(silent, asked)}%)
              {registrySilentShare !== null && `, against ${Math.round(100 * registrySilentShare)}% across the registry`}.
            </p>
          )}

          <div className="grid gap-2.5 border border-edge p-4 pb-2">
            <p className="text-[0.9375rem] font-normal">
              Its share of all startups labelled each year. The dashed line is its share of the whole registry, {Math.round(overall)}%.
            </p>
            <ShareChart years={years} overall={overall} t={t} renderer={renderer} />
          </div>
        </section>

        <section className="grid min-w-0 gap-3">
          <Heading count={repeat.length || undefined}>People with more than one startup</Heading>
          {repeat.length ? (
            <ul className="border-t border-edge">
              {repeat.map((p) => (
                <li key={p.slug} className="grid grid-cols-[minmax(0,1fr)_max-content] items-baseline gap-x-5 border-b border-hairline py-2.5">
                  <Link to="/people/$slug" params={{ slug: p.slug }} className="font-display text-xl leading-snug font-bold text-ink" dir="auto">
                    {p.name}
                  </Link>
                  <span className="text-end text-sm">
                    {p.startups.map((s, i) => (
                      <span key={s.id}>
                        {i > 0 && ', '}
                        <Link to="/startups/$id" params={{ id: s.id }}>
                          {s.name}
                        </Link>
                      </span>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="max-w-[64ch] text-base font-normal">No founder of this sector appears on a second startup.</p>
          )}
        </section>
      </div>
    </article>
  )
}
