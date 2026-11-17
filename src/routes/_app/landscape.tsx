import { barY, cell, defineChart, lineY } from '@tanstack/charts'
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
  { id: 'fields', label: 'Sectors and themes' },
  { id: 'teams', label: 'Teams' },
  { id: 'rhythm', label: 'Label rhythm' },
] as const
type Tab = (typeof TABS)[number]['id']
type Search = { tab?: Tab; sector?: string; by?: 'sector' | 'theme'; as?: 'count' | 'share' }

export const Route = createFileRoute('/_app/landscape')({
  validateSearch: (s: Record<string, unknown>): Search => ({
    tab: TABS.some((t) => t.id === s.tab) ? (s.tab as Tab) : undefined,
    sector: typeof s.sector === 'string' && s.sector ? s.sector : Array.isArray(s.sector) && typeof s.sector[0] === 'string' ? s.sector[0] : undefined,
    by: s.by === 'theme' ? 'theme' : undefined,
    as: s.as === 'share' ? 'share' : undefined,
  }),
  loader: () => getLandscapeRows(),
  component: LandscapePage,
})

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const TEAMS = ['1 founder', '2 founders', '3 founders', '4 or more'] as const
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0)
const H = 340

type Tokens = Record<'glaze' | 'ochre' | 'terracotta' | 'manganese' | 'steel' | 'ink' | 'ink2' | 'ink3' | 'hairline' | 'edge' | 'canvas' | 'surface' | 'raised' | 'tile4', string>

/** Athar's tokens as real colours (SVG paint cannot read CSS variables); empty until mount so hydration matches. */
function useTokens() {
  const [t, setT] = useState<Tokens | null>(null)
  useEffect(() => {
    const read = () => {
      const s = getComputedStyle(document.documentElement)
      const v = (n: string) => s.getPropertyValue(n).trim()
      setT({ glaze: v('--glaze'), ochre: v('--ochre'), terracotta: v('--tile-terracotta'), manganese: v('--tile-manganese'), steel: v('--tile-steel'), ink: v('--ink'), ink2: v('--ink-2'), ink3: v('--ink-3'), hairline: v('--hairline'), edge: v('--edge'), canvas: v('--canvas'), surface: v('--surface'), raised: v('--surface-raised'), tile4: v('--tile-4') })
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
        {tab === 'fields' && (
          <Fields
            {...props}
            by={search.by ?? 'sector'}
            as={search.as ?? 'count'}
            onBy={(v) => setSearch({ by: v === 'theme' ? 'theme' : undefined })}
            onAs={(v) => setSearch({ as: v === 'share' ? 'share' : undefined })}
          />
        )}
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

/** Growth: bars for startups founded each year, a line for labels granted each year. The gap between them is the lag. */
function Growth({ rows, years: labelYears, t, renderer }: PanelProps) {
  const founded = rows.map((r) => r.founded).filter((y): y is number => y !== null)
  const y0 = Math.min(...founded)
  const y1 = Math.max(...founded, ...rows.map((r) => r.year))
  const years = Array.from({ length: y1 - y0 + 1 }, (_, i) => String(y0 + i))
  const bars = years.map((y) => ({ year: y, count: rows.filter((r) => r.founded === Number(y)).length }))
  const line = years.filter((y) => Number(y) >= labelYears[0]).map((y) => ({ year: y, count: rows.filter((r) => r.year === Number(y)).length }))
  const pf = [...bars].sort((a, b) => b.count - a.count)[0]
  const pl = [...line].sort((a, b) => b.count - a.count)[0]
  const lastL = line.at(-1)
  const before = rows.filter((r) => r.founded !== null && r.founded < labelYears[0]).length
  const known = rows.filter((r) => r.founded !== null)
  const same = known.filter((r) => r.year - r.founded! <= 0).length
  const within1 = known.filter((r) => r.year - r.founded! <= 1).length
  const def = useMemo(
    () =>
      t &&
      defineChart({
        marks: [
          barY(bars, { id: 'founded', x: 'year', y: 'count', key: 'year', fill: t.tile4, inset: 6, radius: 2 }),
          lineY(line, { id: 'labelled', x: 'year', y: 'count', key: 'year', stroke: t.glaze, strokeWidth: 3, points: true }),
        ],
        scales: {
          x: { scale: () => scaleBand<string>().domain(years).padding(0.14), axis: axisText },
          y: { scale: scaleLinear, nice: true, grid: { stroke: t.hairline }, axis: axisText },
        },
        focus: 'group-x',
        tooltip: {
          use: tooltip,
          items: [
            { channel: 'x' },
            { id: 'v', label: 'Count', text: (p: { datum: { count: number }; markId?: string }) => `${p.datum.count} ${p.markId === 'labelled' ? 'labelled' : 'founded'}` },
          ],
        },
        theme: theme(t, [t.tile4, t.glaze]),
        margin: { left: 44 },
      }),
    [t, JSON.stringify(bars), JSON.stringify(line)], // eslint-disable-line react-hooks/exhaustive-deps
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
          <Legend items={t ? [['Founded that year (bars)', t.tile4], ['Labelled that year (line)', t.glaze]] : []} />
          {def ? <Chart definition={def} renderer={renderer} height={H} ariaLabel="Startups founded each year as bars, and labelled each year as a line" /> : <Empty />}
        </>
      }
    >
      <p>
        Founding peaked in {pf?.year} with {pf?.count}. Where the line sits above the bars, the label was catching up on startups founded earlier: {before} were founded before {labelYears[0]}.
      </p>
      <p>
        Most do not wait: {pct(same, known.length)}% get the label the year they are founded, {pct(within1, known.length)}% within a year.
      </p>
      <p className="text-ink-2">Recent founding years look small partly because young startups may not have applied yet.</p>
    </Layout>
  )
}

const FIELD_COLOURS = (t: Tokens) => [t.glaze, t.ochre, t.manganese, t.terracotta, t.steel, t.ink2]
const MAX_LINES = 6

/** Fields: each sector or theme across label years, as a number or as its share of that year. */
function Fields({ rows, years, t, renderer, by, as, onBy, onAs }: PanelProps & { by: 'sector' | 'theme'; as: 'count' | 'share'; onBy: (v: 'sector' | 'theme') => void; onAs: (v: 'count' | 'share') => void }) {
  const base = by === 'theme' ? rows.filter((r) => r.described) : rows
  const fields = useMemo(() => {
    const names = by === 'sector' ? [...new Set(base.map((r) => r.sector))] : THEMES.map((th) => th.id)
    const total = (f: string) => base.filter((r) => (by === 'sector' ? r.sector === f : r.themes.includes(f))).length
    return names
      .map((f) => ({ id: f, label: by === 'sector' ? f : (THEMES.find((th) => th.id === f)?.label ?? f), total: total(f) }))
      .filter((f) => f.total > 0)
      .sort((a, b) => b.total - a.total)
  }, [by, base.length]) // eslint-disable-line react-hooks/exhaustive-deps
  const [visible, setVisible] = useState<readonly string[]>([])
  useEffect(() => setVisible(fields.slice(0, 5).map((f) => f.label)), [fields])
  const data = fields.filter((f) => visible.includes(f.label)).flatMap((f) =>
    years.map((y) => {
      const n = base.filter((r) => r.year === y).length
      const k = base.filter((r) => r.year === y && (by === 'sector' ? r.sector === f.id : r.themes.includes(f.id))).length
      return { year: String(y), field: f.label, value: as === 'count' ? k : n >= 10 ? k / n : null, k, n }
    }),
  )
  const top = fields[0]
  const growth = fields
    .map((f) => {
      const share = (y: number) => {
        const n = base.filter((r) => r.year === y).length
        return n >= 10 ? base.filter((r) => r.year === y && (by === 'sector' ? r.sector === f.id : r.themes.includes(f.id))).length / n : null
      }
      const early = share(years[0])
      const lateYear = [...years].reverse().find((y) => share(y) !== null)
      return { f, early, late: lateYear ? share(lateYear) : null, lateYear }
    })
    .filter((g) => g.early !== null && g.late !== null && g.f.total >= 10)
    .sort((a, b) => b.late! - b.early! - (a.late! - a.early!))
  const riser = growth[0]
  const colours = t ? FIELD_COLOURS(t) : []
  const domain = fields.map((f) => f.label)
  // A shown field keeps its colour while shown; colours go to the visible fields in the order they were picked.
  const colourOf = (label: string) => colours[Math.max(0, visible.indexOf(label)) % Math.max(1, colours.length)]
  const toggle = (label: string) => setVisible((v) => (v.includes(label) ? v.filter((x) => x !== label) : v.length >= MAX_LINES ? v : [...v, label]))
  const def = useMemo(
    () =>
      t &&
      defineChart({
        marks: [lineY(data, { x: 'year', y: 'value', color: 'field', key: (d) => `${d.field}-${d.year}`, strokeWidth: 2.5, points: true })],
        scales: {
          x: { scale: () => scaleBand<string>().padding(0.5), axis: axisText },
          y: { scale: scaleLinear, nice: true, grid: { stroke: t.hairline }, axis: as === 'share' ? { ...percentAxis } : axisText },
        },
        color: {
          domain,
          range: domain.map((d) => colourOf(d)),
        },
        focus: 'group-x',
        maxFocusDistance: Number.POSITIVE_INFINITY,
        tooltip: {
          use: tooltip,
          items: [{ channel: 'x' }, { id: 'v', label: as === 'count' ? 'Startups' : 'Share of the year', text: (p: { datum: { k: number; n: number; value: number | null } }) => (as === 'count' ? String(p.datum.k) : `${Math.round((p.datum.value ?? 0) * 100)}% (${p.datum.k} of ${p.datum.n})`) }],
        },
        theme: theme(t, colours),
        margin: { left: 48 },
      }),
    [t, JSON.stringify(data), visible, as], // eslint-disable-line react-hooks/exhaustive-deps
  )
  return (
    <Layout
      question={by === 'sector' ? 'Which sectors grow, and how big is each year?' : 'Which themes rise in the descriptions?'}
      finding={
        riser ? (
          <>
            {riser.f.label} rose the most: {Math.round(riser.early! * 100)}% of {years[0]} {by === 'theme' ? 'descriptions' : 'labels'}, {Math.round(riser.late! * 100)}% in {riser.lateYear}.
          </>
        ) : (
          <>{top?.label} is the largest, with {top?.total}.</>
        )
      }
      chart={
        <>
          <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-3">
            <Segmented label="Fields" value={by} options={[['sector', 'Sectors'], ['theme', 'Themes']]} onChange={onBy} />
            <Segmented label="Show" value={as} options={[['count', 'Number'], ['share', '% of that year']]} onChange={onAs} />
          </div>
          <ul aria-label={`Choose ${by === 'sector' ? 'sectors' : 'themes'}, up to ${MAX_LINES}`} className="mb-3 flex flex-wrap gap-1.5">
            {fields.map((f) => {
              const on = visible.includes(f.label)
              return (
                <li key={f.id}>
                  <button
                    type="button"
                    aria-pressed={on}
                    disabled={!on && visible.length >= MAX_LINES}
                    onClick={() => toggle(f.label)}
                    className={cn(
                      'inline-flex h-8 items-center gap-2 rounded-md border px-2.5 text-sm transition-colors motion-reduce:transition-none',
                      on ? 'border-ink bg-surface text-ink' : 'border-edge/70 text-ink-2 hover:border-ink hover:text-ink disabled:opacity-100 disabled:hover:border-edge/70 disabled:hover:text-ink-2',
                    )}
                  >
                    <span aria-hidden className={cn('size-2.5 rounded-[2px]', !on && 'border border-edge')} style={on ? { background: colourOf(f.label) } : undefined} />
                    {f.label}
                    <span className="font-mono text-[0.8125rem] text-ink-3">{f.total}</span>
                  </button>
                </li>
              )
            })}
          </ul>
          {def ? <Chart definition={def} renderer={renderer} height={H + 40} ariaLabel={`${by === 'sector' ? 'Sectors' : 'Themes'} per label year, ${as === 'count' ? 'as a number' : 'as a share of that year'}`} /> : <Empty h={H + 40} />}
        </>
      }
    >
      <p>
        Pick up to {MAX_LINES} {by === 'sector' ? 'sectors' : 'themes'} to compare. “% of that year” shows each field&apos;s share of the startups labelled that year, so a small year and a big year compare fairly.
      </p>
      {by === 'theme' && <p className="text-ink-2">Themes are read from description keywords, so they are an estimate, and only described startups count. Years with fewer than 10 descriptions are left out of the percentages.</p>}
    </Layout>
  )
}

function Segmented<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="text-[0.9375rem] text-ink-2">{label}</span>
      <div role="radiogroup" aria-label={label} className="flex rounded-md border border-edge p-0.5">
        {options.map(([v, text]) => (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={value === v}
            onClick={() => onChange(v)}
            className={cn('h-8 rounded-[4px] px-3 text-sm transition-colors motion-reduce:transition-none', value === v ? 'bg-ink text-canvas' : 'text-ink hover:bg-surface')}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  )
}

const CELL = 13
/** One label year as a waffle: one square per startup, coloured by team size. */
function YearWaffle({ year, rows, t, renderer }: { year: number; rows: LandscapeRow[]; t: Tokens; renderer: ReturnType<typeof motion> }) {
  const size = (r: LandscapeRow) => (r.founders <= 1 ? TEAMS[0] : r.founders === 2 ? TEAMS[1] : r.founders === 3 ? TEAMS[2] : TEAMS[3])
  const list = rows.filter((r) => r.year === year)
  const data = TEAMS.map((team) => ({ team, count: list.filter((r) => size(r) === team).length }))
  const cols = 10
  const h = Math.max(1, Math.ceil(list.length / cols)) * CELL
  const def = useMemo(
    () =>
      defineChart({
        marks: [waffleY(data, { y: 'count', color: 'team', key: 'team', unit: 1, columns: cols, gap: 2, radius: 2 })],
        scales: { x: null, y: null },
        color: { domain: [...TEAMS], range: four(t) },
        tooltip: { use: tooltip, items: [{ id: 'y', label: 'Year', text: () => String(year) }, { field: 'team', label: 'Team' }, { id: 'n', label: 'Startups', text: (p: { datum: { count: number } }) => `${p.datum.count} of ${list.length}` }] },
        theme: theme(t, four(t)),
        guides: false,
        margin: 0,
      }),
    [t, JSON.stringify(data)], // eslint-disable-line react-hooks/exhaustive-deps
  )
  const solo = data[0].count
  return (
    <figure className="m-0 flex flex-col items-start">
      <div style={{ width: cols * CELL }}>
        <Chart definition={def} renderer={renderer} height={h} width={cols * CELL} ariaLabel={`${year}: ${list.length} startups by team size`} />
      </div>
      <figcaption className="mt-2 text-sm">
        <span className="font-medium text-ink">{year}</span> <span className="font-mono text-ink-3">{list.length}</span>
        <span className="block text-ink-2">{pct(solo, list.length)}% solo</span>
      </figcaption>
    </figure>
  )
}

/** Teams: one waffle per label year, one square per startup; and the people behind more than one startup. */
function Teams({ rows, years, t, renderer, founders }: PanelProps & { founders: RepeatFounder[] }) {
  const early = rows.filter((r) => r.year === years[0])
  const late = rows.filter((r) => r.year >= years[years.length - 3])
  const avg = rows.length ? (rows.reduce((a, r) => a + r.founders, 0) / rows.length).toFixed(1) : '0'
  const [more, setMore] = useState(false)
  const shown = more ? founders : founders.slice(0, 8)
  const counts = TEAMS.map((team, i) => [team, rows.filter((r) => (i === 3 ? r.founders >= 4 : r.founders === i + 1) || (i === 0 && r.founders === 0)).length] as const)
  return (
    <div>
      <div className="grid gap-x-12 gap-y-6 xl:grid-cols-[minmax(0,1fr)_26rem]">
        <div className="min-w-0 xl:order-2">
          <h2 className="font-sans text-[0.9375rem] font-medium text-ink-2">Who builds them?</h2>
          <p className="mt-2 font-display text-[1.875rem] leading-10 text-ink">
            Teams average {avg} founders; solo founders went from {pct(early.filter((r) => r.founders <= 1).length, early.length)}% in {years[0]} to {pct(late.filter((r) => r.founders <= 1).length, late.length)}% since {years[years.length - 3]}.
          </p>
          <p className="mt-4 text-[0.9375rem] leading-7 text-ink">Each square is one startup, in the year it was labelled, coloured by how many founders it lists. Hover a colour for its count.</p>
        </div>
        <div className="min-w-0 xl:order-1">
          <Legend items={counts.map(([l, n], i) => [`${l} · ${n}`, t ? four(t)[i] : 'transparent'])} />
          <div className="mt-2 flex flex-wrap items-end gap-x-7 gap-y-6">{t ? years.map((y) => <YearWaffle key={y} year={y} rows={rows} t={t} renderer={renderer} />) : <Empty h={260} />}</div>
        </div>
      </div>

      <div className="mt-10 border-t border-edge/60 pt-6">
        <p className="text-[0.9375rem] font-medium text-ink">
          {founders.length} {founders.length === 1 ? 'person is' : 'people are'} named on more than one startup
        </p>
        <ul className="mt-3 grid gap-x-10 gap-y-2 md:grid-cols-2 2xl:grid-cols-3">
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
        <p className="mt-2 text-sm text-ink-2">Matched on the written name, so a namesake can appear here by mistake.</p>
      </div>
    </div>
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
