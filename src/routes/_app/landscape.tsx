import { barX, barY, cell, defineChart, group, lineY } from '@tanstack/charts'
import { motion } from '@tanstack/charts/motion'
import { Chart } from '@tanstack/charts/react/core'
import { scaleBand } from '@tanstack/charts/scales/band'
import { scaleLinear } from '@tanstack/charts/scales/linear'
import { tooltip } from '@tanstack/charts/tooltip'
import { waffleY } from '@tanstack/charts/waffle'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { scaleLinear as d3Linear } from 'd3-scale'
import { Check, ChevronDown } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

import { SectorSwatch } from '@/components/athar/tile-mark'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { getLandscapeRows, type LandscapeRow, type RepeatFounder } from '#/server/api/app'
import { THEMES } from '#/shared/themes'

const TABS = [
  { id: 'growth', label: 'Growth' },
  { id: 'speed', label: 'Speed to label' },
  { id: 'themes', label: 'Themes' },
  { id: 'teams', label: 'Teams' },
  { id: 'rhythm', label: 'Label rhythm' },
] as const
type Tab = (typeof TABS)[number]['id']
type Search = { tab?: Tab; sector?: string; theme?: string }

export const Route = createFileRoute('/_app/landscape')({
  validateSearch: (s: Record<string, unknown>): Search => ({
    tab: TABS.some((t) => t.id === s.tab) ? (s.tab as Tab) : undefined,
    sector: typeof s.sector === 'string' && s.sector ? s.sector : Array.isArray(s.sector) && typeof s.sector[0] === 'string' ? s.sector[0] : undefined,
    theme: typeof s.theme === 'string' && THEMES.some((t) => t.id === s.theme) ? s.theme : undefined,
  }),
  loader: () => getLandscapeRows(),
  component: LandscapePage,
})

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const TEAMS = ['1 founder', '2 founders', '3 founders', '4 or more'] as const
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0)
const H = 340

type Tokens = Record<'glaze' | 'ochre' | 'terracotta' | 'ink' | 'ink2' | 'ink3' | 'hairline' | 'edge' | 'canvas' | 'surface' | 'raised' | 'tile4', string>

/** Athar's tokens as real colours (SVG paint cannot read CSS variables); empty until mount so hydration matches. */
function useTokens() {
  const [t, setT] = useState<Tokens | null>(null)
  useEffect(() => {
    const read = () => {
      const s = getComputedStyle(document.documentElement)
      const v = (n: string) => s.getPropertyValue(n).trim()
      setT({ glaze: v('--glaze'), ochre: v('--ochre'), terracotta: v('--tile-terracotta'), ink: v('--ink'), ink2: v('--ink-2'), ink3: v('--ink-3'), hairline: v('--hairline'), edge: v('--edge'), canvas: v('--canvas'), surface: v('--surface'), raised: v('--surface-raised'), tile4: v('--tile-4') })
    }
    read()
    const mo = new MutationObserver(read)
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] })
    const mq = matchMedia('(prefers-color-scheme: dark)')
    mq.addEventListener('change', read)
    return () => (mo.disconnect(), mq.removeEventListener('change', read))
  }, [])
  return t
}

const four = (t: Tokens) => [t.glaze, t.ochre, t.terracotta, t.tile4]
const theme = (t: Tokens, palette: string[]) => ({ foreground: t.ink, muted: t.ink2, grid: t.hairline, background: t.canvas, palette })
const axisText = { tickLabels: { fontSize: 13 } }
const percentAxis = { ...axisText, ticks: { format: (v: number) => `${Math.round(v * 100)}%`, count: 4 } }

// Landscape: one question at a time. Each tab pairs a single chart with the answer it gives; one filter, the sector.
function LandscapePage() {
  const { rows: all, founders } = Route.useLoaderData()
  const search = Route.useSearch()
  const navigate = useNavigate({ from: '/landscape' })
  const t = useTokens()
  const renderer = useMemo(() => motion({ transition: { type: 'spring', stiffness: 220, damping: 28, mass: 1 } }), [])
  const tab: Tab = search.tab ?? 'growth'
  const sector = search.sector
  const rows = sector ? all.filter((r) => r.sector === sector) : all
  const sectors = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of all) m.set(r.sector, (m.get(r.sector) ?? 0) + 1)
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }, [all])
  const labelYears = useMemo(() => [...new Set(all.map((r) => r.year))].sort(), [all])
  const setSearch = (p: Partial<Search>) => navigate({ search: (s) => ({ ...s, ...p }), resetScroll: false, replace: true })
  const props = { rows, years: labelYears, t, renderer }

  const tipStyle = t
    ? ({
        '--ts-chart-tooltip-background': t.raised,
        '--ts-chart-tooltip-color': t.ink,
        '--ts-chart-tooltip-border': `1px solid ${t.edge}`,
        '--ts-chart-tooltip-border-radius': '6px',
        '--ts-chart-tooltip-font': '14px "Readex Pro", system-ui, sans-serif',
        '--ts-chart-tooltip-padding': '10px 12px',
      } as React.CSSProperties)
    : undefined

  return (
    <main className="mx-auto w-full max-w-[110rem] flex-1 px-4 pt-10 pb-16 sm:px-8" style={tipStyle}>
      <header className="flex flex-wrap items-end justify-between gap-x-10 gap-y-5">
        <div>
          <h1 className="text-[2.75rem] leading-[3rem]">Landscape</h1>
          <p className="mt-3 max-w-[48rem] text-lg leading-8 text-ink">
            What {rows.length} labelled startups{sector ? ` in ${sector}` : ''} say about the scene, one question at a time.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <SectorPicker sectors={sectors} value={sector} onChange={(s) => setSearch({ sector: s })} />
          <button type="button" onClick={() => downloadCsv(all)} className="min-h-9 text-[0.9375rem] text-glaze underline underline-offset-4">
            Download the data (CSV)
          </button>
        </div>
      </header>

      <Tabs value={tab} onChange={(id) => setSearch({ tab: id === 'growth' ? undefined : id })} />

      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="pt-8">
        {tab === 'growth' && <Growth {...props} />}
        {tab === 'speed' && <Speed {...props} />}
        {tab === 'themes' && <Themes {...props} selected={search.theme ?? 'ai'} onSelect={(id) => setSearch({ theme: id === 'ai' ? undefined : id })} sector={sector} />}
        {tab === 'teams' && <Teams {...props} founders={sector ? founders.filter((f) => f.startups.some((s) => rows.some((r) => r.id === s.id))) : founders} />}
        {tab === 'rhythm' && <Rhythm {...props} />}
      </div>

      <p className="mt-12 max-w-[60rem] border-t border-edge/60 pt-4 text-sm leading-6 text-ink-2">
        Everything here comes from the registry rows: founding year, label month, founders listed and each startup&apos;s own description. The registry says nothing about funding, revenue or survival.
      </p>
    </main>
  )
}

function Tabs({ value, onChange }: { value: Tab; onChange: (t: Tab) => void }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const go = (i: number) => {
    const n = (i + TABS.length) % TABS.length
    refs.current[n]?.focus()
    onChange(TABS[n].id)
  }
  return (
    <div role="tablist" aria-label="Questions" className="mt-8 flex gap-1 overflow-x-auto border-b border-edge">
      {TABS.map((tb, i) => (
        <button
          key={tb.id}
          ref={(el) => {
            refs.current[i] = el
          }}
          id={`tab-${tb.id}`}
          role="tab"
          type="button"
          aria-selected={value === tb.id}
          aria-controls={`panel-${tb.id}`}
          tabIndex={value === tb.id ? 0 : -1}
          onClick={() => onChange(tb.id)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight') (e.preventDefault(), go(i + 1))
            if (e.key === 'ArrowLeft') (e.preventDefault(), go(i - 1))
          }}
          className={cn(
            '-mb-px min-h-11 border-b-2 px-4 text-[0.9375rem] whitespace-nowrap transition-colors motion-reduce:transition-none',
            value === tb.id ? 'border-glaze font-medium text-ink' : 'border-transparent text-ink-2 hover:text-ink',
          )}
        >
          {tb.label}
        </button>
      ))}
    </div>
  )
}

type PanelProps = { rows: LandscapeRow[]; years: number[]; t: Tokens | null; renderer: ReturnType<typeof motion> }

/** The answer beside its chart: question, finding, how to read it. */
function Layout({ question, finding, chart, children }: { question: string; finding: React.ReactNode; chart: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="grid gap-x-12 gap-y-6 xl:grid-cols-[minmax(0,1fr)_26rem]">
      <div className="min-w-0 xl:order-2">
        <h2 className="font-sans text-[0.9375rem] font-medium text-ink-2">{question}</h2>
        <p className="mt-2 font-display text-[1.875rem] leading-10 text-ink">{finding}</p>
        <div className="mt-4 grid gap-3 text-[0.9375rem] leading-7 text-ink">{children}</div>
      </div>
      <div className="min-w-0 xl:order-1">{chart}</div>
    </div>
  )
}

const Empty = ({ h = H }: { h?: number }) => <div style={{ height: h }} />

function Legend({ items }: { items: [string, string][] }) {
  return (
    <ul className="mb-3 flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-ink">
      {items.map(([label, colour]) => (
        <li key={label} className="flex items-center gap-2">
          <span aria-hidden className="size-3 rounded-[2px]" style={{ background: colour }} />
          {label}
        </li>
      ))}
    </ul>
  )
}

/** Growth: how many were founded and how many labelled, each year. */
function Growth({ rows, t, renderer }: PanelProps) {
  const founded = rows.map((r) => r.founded).filter((y): y is number => y !== null)
  const y0 = Math.min(...founded)
  const y1 = Math.max(...founded, ...rows.map((r) => r.year))
  const years = Array.from({ length: y1 - y0 + 1 }, (_, i) => y0 + i)
  const data = years.flatMap((y) => [
    { year: String(y), kind: 'Founded', count: rows.filter((r) => r.founded === y).length },
    { year: String(y), kind: 'Labelled', count: rows.filter((r) => r.year === y).length },
  ])
  const peak = (kind: string) => data.filter((d) => d.kind === kind).sort((a, b) => b.count - a.count)[0]
  const pf = peak('Founded')
  const pl = peak('Labelled')
  const lastL = data.filter((d) => d.kind === 'Labelled').at(-1)
  const before = rows.filter((r) => r.founded !== null && r.founded < 2019).length
  const def = useMemo(
    () =>
      t &&
      defineChart({
        marks: [barY(data, { x: 'year', y: 'count', color: 'kind', key: (d) => `${d.year}-${d.kind}`, layout: group({ padding: 0.12 }), inset: 1, radius: 2 })],
        scales: {
          x: { scale: () => scaleBand<string>().padding(0.18), axis: axisText },
          y: { scale: scaleLinear, nice: true, grid: { stroke: t.hairline }, axis: axisText },
        },
        color: { domain: ['Founded', 'Labelled'], range: [t.tile4, t.glaze] },
        focus: 'group-x',
        tooltip: { use: tooltip, sort: 'color-domain' },
        theme: theme(t, [t.tile4, t.glaze]),
        margin: { left: 44 },
      }),
    [t, JSON.stringify(data)], // eslint-disable-line react-hooks/exhaustive-deps
  )
  return (
    <Layout
      question="How many each year?"
      finding={
        <>
          Labels peaked in {pl?.year} with {pl?.count}; {lastL?.year} added {lastL?.count}.
        </>
      }
      chart={
        <>
          <Legend items={t ? [['Founded that year', t.tile4], ['Labelled that year', t.glaze]] : []} />
          {def ? <Chart definition={def} renderer={renderer} height={H} ariaLabel="Startups founded and labelled each year" /> : <Empty />}
        </>
      }
    >
      <p>
        Founding peaked in {pf?.year} with {pf?.count}. {before} were founded before the label existed in 2019, and received it later.
      </p>
      <p className="text-ink-2">Recent founding years look small partly because young startups may not have applied yet.</p>
    </Layout>
  )
}

/** Speed: how soon after founding the label comes, as two lines over label years. */
function Speed({ rows, years, t, renderer }: PanelProps) {
  const lag = (r: LandscapeRow) => (r.founded === null ? null : r.year - r.founded)
  const data = years.flatMap((y) => {
    const list = rows.filter((r) => r.year === y && lag(r) !== null)
    return [
      { year: String(y), line: 'The same year', share: list.length ? list.filter((r) => lag(r)! <= 0).length / list.length : null, n: list.length },
      { year: String(y), line: 'Within a year', share: list.length ? list.filter((r) => lag(r)! <= 1).length / list.length : null, n: list.length },
    ]
  })
  const known = rows.filter((r) => lag(r) !== null)
  const old = rows.filter((r) => r.year === years[0] && (lag(r) ?? 0) >= 4).length
  const firstN = rows.filter((r) => r.year === years[0]).length
  const def = useMemo(
    () =>
      t &&
      defineChart({
        marks: [lineY(data, { x: 'year', y: 'share', z: 'line', color: 'line', key: (d) => `${d.year}-${d.line}`, strokeWidth: 3, points: true })],
        scales: {
          x: { scale: () => scaleBand<string>().padding(0.5), axis: axisText },
          y: { scale: scaleLinear().domain([0, 1]), grid: { stroke: t.hairline }, axis: percentAxis },
        },
        color: { domain: ['Within a year', 'The same year'], range: [t.ochre, t.glaze] },
        focus: 'group-x',
        tooltip: { use: tooltip, sort: 'color-domain' },
        theme: theme(t, [t.ochre, t.glaze]),
        margin: { left: 44 },
      }),
    [t, JSON.stringify(data)], // eslint-disable-line react-hooks/exhaustive-deps
  )
  return (
    <Layout
      question="How soon after founding does the label come?"
      finding={
        <>
          {pct(known.filter((r) => lag(r)! <= 0).length, known.length)}% get it the year they are founded; {pct(known.filter((r) => lag(r)! <= 1).length, known.length)}% within a year.
        </>
      }
      chart={
        <>
          <Legend items={t ? [['Labelled the same year they were founded', t.glaze], ['Within a year of founding', t.ochre]] : []} />
          {def ? <Chart definition={def} renderer={renderer} height={H} ariaLabel="Share labelled the same year and within a year of founding, per label year" /> : <Empty />}
        </>
      }
    >
      <p>
        The first year was a catch-up: in {years[0]}, {old} of {firstN} were already four or more years old.
      </p>
      <p className="text-ink-2">Each point is one label year. Founding is known to the year only, so “the same year” can mean up to twelve months.</p>
    </Layout>
  )
}

/** Themes: a ranking of what descriptions mention, and how the picked theme moves. */
function Themes({ rows, years, t, renderer, selected, onSelect, sector }: PanelProps & { selected: string; onSelect: (id: string) => void; sector?: string }) {
  const described = rows.filter((r) => r.described)
  const counts = THEMES.map((th) => ({ id: th.id, label: th.label, count: described.filter((r) => r.themes.includes(th.id)).length }))
    .filter((c) => c.count > 0)
    .sort((a, b) => b.count - a.count)
  const sel = THEMES.find((th) => th.id === selected) ?? THEMES[0]
  const trend = years.map((y) => {
    const n = described.filter((r) => r.year === y).length
    const k = described.filter((r) => r.year === y && r.themes.includes(sel.id)).length
    return { year: String(y), share: n >= 10 ? k / n : null, k, n }
  })
  const firstYear = trend.find((d) => d.share !== null)
  const lastYear = [...trend].reverse().find((d) => d.share !== null)
  const bars = useMemo(
    () =>
      t &&
      defineChart({
        marks: [barX(counts, { y: 'label', x: 'count', key: 'id', fill: (d) => (d.id === sel.id ? t.glaze : t.tile4), inset: 3, radius: 2 })],
        scales: {
          y: { scale: () => scaleBand<string>().padding(0.18), axis: { tickLabels: { fontSize: 13 }, ticks: { line: false } } },
          x: { scale: scaleLinear, grid: { stroke: t.hairline }, axis: axisText },
        },
        focus: 'nearest-y',
        tooltip: { use: tooltip, items: [{ channel: 'y' }, { channel: 'x', text: (p: { datum: { count: number } }) => `${p.datum.count} of ${described.length} described` }] },
        theme: theme(t, [t.glaze]),
        margin: { left: 170 },
      }),
    [t, JSON.stringify(counts), sel.id], // eslint-disable-line react-hooks/exhaustive-deps
  )
  const line = useMemo(
    () =>
      t &&
      defineChart({
        marks: [lineY(trend, { x: 'year', y: 'share', key: 'year', stroke: t.glaze, strokeWidth: 2.5, points: true })],
        scales: {
          x: { scale: () => scaleBand<string>().padding(0.5), axis: axisText },
          y: { scale: scaleLinear, nice: true, grid: { stroke: t.hairline }, axis: { ...percentAxis, ticks: { ...percentAxis.ticks, count: 3 } } },
        },
        focus: 'nearest-x',
        tooltip: { use: tooltip, items: [{ channel: 'x' }, { channel: 'y', text: (p: { datum: { k: number; n: number } }) => `${p.datum.k} of ${p.datum.n} described` }] },
        theme: theme(t, [t.glaze]),
        margin: { left: 44 },
      }),
    [t, JSON.stringify(trend)], // eslint-disable-line react-hooks/exhaustive-deps
  )
  return (
    <Layout
      question="What do they build?"
      finding={
        counts.length ? (
          <>
            {sel.label}: {pct(described.filter((r) => r.themes.includes(sel.id)).length, described.length)}% of descriptions
            {firstYear && lastYear && firstYear !== lastYear ? `, from ${Math.round((firstYear.share ?? 0) * 100)}% in ${firstYear.year} to ${Math.round((lastYear.share ?? 0) * 100)}% in ${lastYear.year}` : ''}.
          </>
        ) : (
          'Too few descriptions to read themes.'
        )
      }
      chart={bars ? <Chart definition={bars} renderer={renderer} height={Math.max(220, counts.length * 24 + 30)} ariaLabel="Startups mentioning each theme" onSelect={(p) => p && onSelect((p.datum as { id: string }).id)} /> : <Empty />}
    >
      <p className="text-ink-2">Click a theme to follow it. Its share of each year&apos;s described startups:</p>
      {line ? <Chart definition={line} renderer={renderer} height={170} ariaLabel={`Share mentioning ${sel.label} by label year`} /> : <Empty h={170} />}
      <p>
        <Link to="/search" search={{ q: sel.query, sector }}>
          Open “{sel.label}” in the Archive
        </Link>
      </p>
      <p className="text-ink-2">Read from description keywords, so an estimate. Years with fewer than 10 descriptions are left out.</p>
    </Layout>
  )
}

/** Teams: one waffle of team sizes, and the people behind more than one startup. */
function Teams({ rows, years, t, renderer, founders }: PanelProps & { founders: RepeatFounder[] }) {
  const size = (r: LandscapeRow) => (r.founders <= 1 ? TEAMS[0] : r.founders === 2 ? TEAMS[1] : r.founders === 3 ? TEAMS[2] : TEAMS[3])
  const data = TEAMS.map((team) => ({ team, share: rows.length ? rows.filter((r) => size(r) === team).length / rows.length : 0, count: rows.filter((r) => size(r) === team).length }))
  const early = rows.filter((r) => r.year === years[0])
  const late = rows.filter((r) => r.year >= years[years.length - 3])
  const avg = rows.length ? (rows.reduce((a, r) => a + r.founders, 0) / rows.length).toFixed(1) : '0'
  const [more, setMore] = useState(false)
  const def = useMemo(
    () =>
      t &&
      defineChart({
        marks: [waffleY(data, { y: 'share', color: 'team', key: 'team', unit: 0.01, round: true, columns: 10, gap: 4, radius: 3 })],
        scales: { x: null, y: null },
        color: { domain: [...TEAMS], range: four(t) },
        tooltip: { use: tooltip, items: [{ field: 'team', label: 'Team' }, { id: 'n', label: 'Startups', text: (p: { datum: { count: number; share: number } }) => `${p.datum.count} (${Math.round(p.datum.share * 100)}%)` }] },
        theme: theme(t, four(t)),
        guides: false,
        margin: 0,
      }),
    [t, JSON.stringify(data)], // eslint-disable-line react-hooks/exhaustive-deps
  )
  const shown = more ? founders : founders.slice(0, 8)
  return (
    <Layout
      question="Who builds them?"
      finding={
        <>
          Teams average {avg} founders; solo founders went from {pct(early.filter((r) => r.founders <= 1).length, early.length)}% in {years[0]} to {pct(late.filter((r) => r.founders <= 1).length, late.length)}% since {years[years.length - 3]}.
        </>
      }
      chart={
        <div className="grid gap-x-10 gap-y-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
          <div>
            <Legend items={TEAMS.map((l, i) => [`${l} · ${data[i].count}`, t ? four(t)[i] : 'transparent'])} />
            {def ? <Chart definition={def} renderer={renderer} height={280} ariaLabel="Team sizes, one square per percent of startups" /> : <Empty h={280} />}
            <p className="mt-2 text-sm text-ink-2">One square is one percent of startups.</p>
          </div>
          <div className="min-w-0">
            <p className="text-[0.9375rem] font-medium text-ink">
              {founders.length} {founders.length === 1 ? 'person is' : 'people are'} named on more than one startup
            </p>
            <ul className="mt-3 grid gap-2">
              {shown.map((f) => (
                <li key={f.name} className="min-w-0 text-[0.9375rem]">
                  <span className="text-ink">{f.name}</span>
                  <span className="text-ink-2"> · </span>
                  {f.startups.map((s, i) => (
                    <span key={s.id}>
                      {i > 0 && <span className="text-ink-2">, </span>}
                      <Link to="/startups/$id" params={{ id: s.id }}>
                        {s.name}
                      </Link>
                    </span>
                  ))}
                </li>
              ))}
            </ul>
            {founders.length > 8 && (
              <button type="button" onClick={() => setMore((m) => !m)} className="mt-3 min-h-8 text-sm text-glaze underline underline-offset-4">
                {more ? 'Show fewer' : `Show all ${founders.length}`}
              </button>
            )}
          </div>
        </div>
      }
    >
      <p className="text-ink-2">Founders are matched on the written name, so a namesake can appear in the list by mistake.</p>
    </Layout>
  )
}

/** Rhythm: when labels are granted, month by year, and how complete each year's records are. */
function Rhythm({ rows, years, t, renderer }: PanelProps) {
  const grid = years.flatMap((y) => MONTHS.map((m, i) => ({ year: String(y), month: m, count: rows.filter((r) => r.year === y && r.month === i + 1).length })))
  const peak = Math.max(1, ...grid.map((g) => g.count))
  const byYear = years.map((y) => {
    const list = rows.filter((r) => r.year === y)
    return { y, n: list.length, months: new Set(list.map((r) => r.month)).size, described: pct(list.filter((r) => r.described).length, list.length) }
  })
  const top = [...byYear].sort((a, b) => b.n - a.n)[0]
  const last = byYear[byYear.length - 1]
  const def = useMemo(
    () =>
      t &&
      defineChart({
        marks: [cell(grid, { x: 'month', y: 'year', color: 'count', key: (d) => `${d.year}-${d.month}`, inset: 2 })],
        color: { scale: () => d3Linear<string>().domain([0, peak]).range([t.surface, t.glaze]) },
        scales: {
          x: { scale: () => scaleBand<string>().domain(MONTHS).padding(0.04), axis: axisText },
          y: { scale: () => scaleBand<string>().domain(years.map(String)).padding(0.04), axis: { ...axisText, ticks: { line: false } } },
        },
        tooltip: { use: tooltip, items: [{ id: 'when', label: 'Month', text: (p: { datum: { month: string; year: string } }) => `${p.datum.month} ${p.datum.year}` }, { id: 'n', label: 'Labelled', text: (p: { datum: { count: number } }) => String(p.datum.count) }] },
        theme: theme(t, [t.glaze]),
        margin: { left: 48 },
      }),
    [t, JSON.stringify(grid)], // eslint-disable-line react-hooks/exhaustive-deps
  )
  return (
    <Layout
      question="When are labels granted?"
      finding={
        <>
          {top?.y} was the busiest year with {top?.n}; {last?.y} had {last?.n}, in {last?.months} {last?.months === 1 ? 'month' : 'months'}.
        </>
      }
      chart={def ? <Chart definition={def} renderer={renderer} height={H} ariaLabel="Labels granted per month and year" /> : <Empty />}
    >
      <p className="text-ink-2">Darker green: more labels that month. Hover a month for the count.</p>
      <div>
        <p className="text-ink">How many records describe the startup</p>
        <ul className="mt-2 grid grid-cols-4 gap-x-4 gap-y-1 font-mono text-sm sm:grid-cols-7 xl:grid-cols-4">
          {byYear.map((b) => (
            <li key={b.y} className="flex justify-between gap-2">
              <span className="text-ink-3">{b.y}</span>
              <span className={b.described < 60 ? 'text-ink' : 'text-ink-2'}>{b.described}%</span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-ink-2">Recent records are thin, so read recent trends with care.</p>
      </div>
    </Layout>
  )
}

/** One quiet filter: a sector, or all of them. */
function SectorPicker({ sectors, value, onChange }: { sectors: [string, number][]; value?: string; onChange: (s: string | undefined) => void }) {
  const [open, setOpen] = useState(false)
  const pick = (s: string | undefined) => (onChange(s), setOpen(false))
  const options: [string | undefined, number][] = [[undefined, sectors.reduce((a, [, n]) => a + n, 0)], ...sectors]
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className="inline-flex h-10 items-center gap-2.5 rounded-md border border-edge bg-surface px-3.5 text-[0.9375rem] text-ink hover:border-ink">
        {value ? <SectorSwatch sector={value} size={14} /> : null}
        {value ?? 'All sectors'}
        <ChevronDown className="size-4 text-ink-2" aria-hidden />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[22rem] p-1">
        <ul role="listbox" aria-label="Sector" className="max-h-[24rem] overflow-y-auto">
          {options.map(([s, n]) => (
            <li key={s ?? 'all'}>
              <button type="button" role="option" aria-selected={value === s} onClick={() => pick(s)} className="flex min-h-9 w-full items-center gap-2.5 rounded-[4px] px-2.5 text-start text-[0.9375rem] text-ink hover:bg-surface">
                <span className="grid size-4 place-items-center">{value === s && <Check className="size-4 text-glaze" aria-hidden />}</span>
                {s ? <SectorSwatch sector={s} size={14} /> : <span className="size-[14px]" />}
                <span className={cn('flex-1 truncate', !s && 'font-medium')}>{s ?? 'All sectors'}</span>
                <span className="font-mono text-[0.8125rem] text-ink-3">{n}</span>
              </button>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  )
}

function downloadCsv(rows: LandscapeRow[]) {
  const cellText = (v: string | number | null) => {
    const s = v === null ? '' : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const lines = [
    ['name', 'sector', 'founded', 'label_month', 'founders', 'website', 'described', 'themes'],
    ...rows.map((r) => [r.name, r.sector, r.founded, `${r.year}-${String(r.month).padStart(2, '0')}`, r.founders, r.website ? 'yes' : 'no', r.described ? 'yes' : 'no', r.themes.join(' ')]),
  ]
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([lines.map((l) => l.map(cellText).join(',')).join('\n')], { type: 'text/csv;charset=utf-8' }))
  a.download = 'athar-startups.csv'
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}
