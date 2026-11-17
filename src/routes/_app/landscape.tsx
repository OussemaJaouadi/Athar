import { arrow, barY, defineChart, dot, lineY, text } from '@tanstack/charts'
import { crosshair } from '@tanstack/charts/crosshair'
import { motion } from '@tanstack/charts/motion'
import { Chart } from '@tanstack/charts/react/core'
import { scaleBand } from '@tanstack/charts/scales/band'
import { scaleLinear } from '@tanstack/charts/scales/linear'
import { tooltip } from '@tanstack/charts/tooltip'
import { waffleY } from '@tanstack/charts/waffle'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { Check, ChevronDown } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

import { SectorSwatch } from '@/components/athar/tile-mark'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { getLandscapeRows, type LandscapeRow, type RepeatFounder } from '#/server/api/app'
import { THEMES } from '#/shared/themes'

const TABS = [
  { id: 'growth', label: 'Growth' },
  { id: 'fields', label: 'Fields' },
  { id: 'teams', label: 'Teams' },
] as const
type Tab = (typeof TABS)[number]['id']
type Search = { tab?: Tab; sector?: string; by?: 'theme'; year?: number }

export const Route = createFileRoute('/_app/landscape')({
  validateSearch: (s: Record<string, unknown>): Search => ({
    tab: TABS.some((t) => t.id === s.tab) ? (s.tab as Tab) : undefined,
    sector: typeof s.sector === 'string' && s.sector ? s.sector : Array.isArray(s.sector) && typeof s.sector[0] === 'string' ? s.sector[0] : undefined,
    by: s.by === 'theme' ? 'theme' : undefined,
    year: typeof s.year === 'number' ? s.year : typeof s.year === 'string' && /^\d{4}$/.test(s.year) ? Number(s.year) : undefined,
  }),
  loader: () => getLandscapeRows(),
  component: LandscapePage,
})

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const TEAMS = ['1 founder', '2 founders', '3 founders', '4 or more'] as const
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0)
const sizeOf = (r: LandscapeRow) => (r.founders <= 1 ? 0 : r.founders === 2 ? 1 : r.founders === 3 ? 2 : 3)

type Tokens = Record<'glaze' | 'ochre' | 'terracotta' | 'manganese' | 'steel' | 'ink' | 'ink2' | 'ink3' | 'hairline' | 'edge' | 'canvas' | 'surface' | 'raised' | 'tile4', string>

/** Athar's tokens as real colours (SVG paint cannot read CSS variables); empty until mount so hydration matches. */
function useTokens() {
  const [t, setT] = useState<Tokens | null>(null)
  useEffect(() => {
    const read = () => {
      const s = getComputedStyle(document.documentElement)
      const v = (n: string) => s.getPropertyValue(n).trim()
      setT({
        glaze: v('--glaze'),
        ochre: v('--ochre'),
        terracotta: v('--tile-terracotta'),
        manganese: v('--tile-manganese'),
        steel: v('--tile-steel'),
        ink: v('--ink'),
        ink2: v('--ink-2'),
        ink3: v('--ink-3'),
        hairline: v('--hairline'),
        edge: v('--edge'),
        canvas: v('--canvas'),
        surface: v('--surface'),
        raised: v('--surface-raised'),
        tile4: v('--tile-4'),
      })
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

const theme = (t: Tokens, palette: string[]) => ({ foreground: t.ink, muted: t.ink2, grid: t.hairline, background: t.canvas, palette })
const axisText = { tickLabels: { fontSize: 13 } }
const Empty = ({ h }: { h: number }) => <div style={{ height: h }} />

// Landscape: one question per tab. Question, controls, the chart full width, a caption, then three findings.
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
          <p className="mt-3 max-w-[48rem] text-lg leading-8 text-ink">What {all.length} labelled startups say about the scene, one question at a time.</p>
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
        {tab === 'growth' && <Growth rows={rows} labelYears={labelYears} t={t} renderer={renderer} sector={sector} />}
        {tab === 'fields' && <Fields all={all} t={t} renderer={renderer} by={search.by ?? 'sector'} onBy={(b) => setSearch({ by: b === 'theme' ? 'theme' : undefined })} sector={sector} />}
        {tab === 'teams' && <Teams all={all} years={labelYears} t={t} renderer={renderer} sector={sector} year={search.year} onYear={(y) => setSearch({ year: y })} founders={founders} />}
      </div>

      <p className="mt-14 max-w-[60rem] border-t border-edge/60 pt-4 text-sm leading-6 text-ink-2">
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

type Finding = { figure: React.ReactNode; text: React.ReactNode; link?: React.ReactNode }

/** Every tab: the question, its controls, the chart at full width, a caption, then three findings. */
function Section({ question, controls, chart, caption, findings, children }: { question: string; controls?: React.ReactNode; chart: React.ReactNode; caption: React.ReactNode; findings: Finding[]; children?: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-[1.625rem] leading-9 text-ink">{question}</h2>
      {controls && <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3">{controls}</div>}
      <div className="mt-6">{chart}</div>
      <p className="mt-2 text-[0.8125rem] leading-5 text-ink-2">{caption}</p>
      <div className="mt-10 grid gap-x-12 gap-y-8 md:grid-cols-3">
        {findings.map((f, i) => (
          <div key={i} className="border-t border-edge pt-4">
            <p className="font-display text-[2.75rem] leading-[3.25rem] text-ink">{f.figure}</p>
            <p className="mt-1 text-[0.9375rem] leading-6 text-ink">{f.text}</p>
            {f.link && <p className="mt-2 text-[0.8125rem]">{f.link}</p>}
          </div>
        ))}
      </div>
      {children}
    </section>
  )
}

function Swatches({ items }: { items: [string, string][] }) {
  return (
    <ul className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-ink">
      {items.map(([label, colour]) => (
        <li key={label} className="flex items-center gap-2">
          <span aria-hidden className="size-3 rounded-[2px]" style={{ background: colour }} />
          {label}
        </li>
      ))}
    </ul>
  )
}

function Segmented<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="text-[0.9375rem] text-ink-2">{label}</span>
      <div role="radiogroup" aria-label={label} className="flex rounded-md border border-edge p-0.5">
        {options.map(([v, label]) => (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={value === v}
            onClick={() => onChange(v)}
            className={cn('h-8 rounded-[4px] px-3 text-sm transition-colors motion-reduce:transition-none', value === v ? 'bg-ink text-canvas' : 'text-ink hover:bg-surface')}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}

/* ───────────────────────────── Growth ───────────────────────────── */

/** Bars for startups founded each year, a line for labels granted each year, one tooltip per year. */
function Growth({ rows, labelYears, t, renderer, sector }: { rows: LandscapeRow[]; labelYears: number[]; t: Tokens | null; renderer: ReturnType<typeof motion>; sector?: string }) {
  const founded = rows.map((r) => r.founded).filter((y): y is number => y !== null)
  const y0 = Math.min(...founded)
  const y1 = Math.max(...founded, ...rows.map((r) => r.year))
  const years = Array.from({ length: y1 - y0 + 1 }, (_, i) => String(y0 + i))
  const per = years.map((y) => ({ year: y, founded: rows.filter((r) => r.founded === Number(y)).length, labelled: rows.filter((r) => r.year === Number(y)).length }))
  const bars = per.map((p) => ({ year: p.year, kind: 'Founded', count: p.founded }))
  const line = per.filter((p) => Number(p.year) >= labelYears[0]).map((p) => ({ year: p.year, kind: 'Labelled', count: p.labelled }))
  const pf = [...per].sort((a, b) => b.founded - a.founded)[0]
  const last = per[per.length - 1]
  const known = rows.filter((r) => r.founded !== null)
  const def = useMemo(
    () =>
      t &&
      defineChart({
        marks: [
          crosshair({ x: { band: { inset: 0, fill: t.ink, fillOpacity: 0.06 }, label: false }, y: false }),
          barY(bars, { id: 'founded', x: 'year', y: 'count', key: 'year', fill: t.tile4, inset: 8, radius: 2 }),
          lineY(line, { id: 'labelled', x: 'year', y: 'count', key: 'year', stroke: t.glaze, strokeWidth: 3, points: true }),
        ],
        scales: {
          x: { scale: () => scaleBand<string>().domain(years).padding(0.1), axis: axisText },
          y: { scale: scaleLinear, nice: true, grid: { stroke: t.hairline }, axis: axisText },
        },
        focus: 'group-x',
        maxFocusDistance: Number.POSITIVE_INFINITY,
        tooltip: {
          use: tooltip,
          formatGroup: (points: readonly { datum: { year: string } }[]) => {
            const p = per.find((x) => x.year === points[0]?.datum.year)
            if (!p) return ''
            const d = p.labelled - p.founded
            return [p.year, `Founded ${p.founded}`, `Labelled ${p.labelled}`, Number(p.year) >= labelYears[0] ? `Difference ${d > 0 ? '+' : ''}${d}` : null].filter(Boolean).join('\n')
          },
        },
        theme: theme(t, [t.tile4, t.glaze]),
        margin: { left: 44 },
      }),
    [t, JSON.stringify(per)], // eslint-disable-line react-hooks/exhaustive-deps
  )
  return (
    <Section
      question="How fast did the registry grow?"
      chart={
        <>
          <Swatches items={t ? [['Founded that year (bars)', t.tile4], ['Labelled that year (line)', t.glaze]] : []} />
          <div className="mt-3">{def ? <Chart definition={def} renderer={renderer} height={380} ariaLabel={`Founded and labelled each year. Founding peaked in ${pf?.year} with ${pf?.founded}.`} /> : <Empty h={380} />}</div>
          <DataTable caption="Startups founded and labelled each year" head={['Year', 'Founded', 'Labelled']} rows={per.map((p) => [p.year, p.founded, p.labelled])} />
        </>
      }
      caption="Where the line runs above the bars, the label was catching up on startups founded in earlier years."
      findings={[
        { figure: rows.length, text: `labelled startups${sector ? ` in ${sector}` : ''} in the registry.` },
        { figure: pf?.founded, text: `founded in ${pf?.year}, the peak founding year. ${last?.labelled} were labelled in ${last?.year}.` },
        { figure: `${pct(known.filter((r) => r.year - r.founded! <= 0).length, known.length)}%`, text: `were labelled the year they were founded, ${pct(known.filter((r) => r.year - r.founded! <= 1).length, known.length)}% within one year.` },
      ]}
    />
  )
}

/* ───────────────────────────── Fields ───────────────────────────── */

const EARLY = (r: LandscapeRow) => r.year <= 2021
const PERIODS = ['2019–2021', '2022–2025']
/** One arrow per field: its share of labels in 2019–2021 to its share in 2022–2025. */
function Fields({ all, t, renderer, by, onBy, sector }: { all: LandscapeRow[]; t: Tokens | null; renderer: ReturnType<typeof motion>; by: 'sector' | 'theme'; onBy: (b: 'sector' | 'theme') => void; sector?: string }) {
  const navigate = useNavigate()
  const base = by === 'theme' ? all.filter((r) => r.described) : all
  const a = base.filter(EARLY)
  const b = base.filter((r) => !EARLY(r))
  const ids = by === 'sector' ? [...new Set(all.map((r) => r.sector))] : THEMES.map((th) => th.id)
  const has = (r: LandscapeRow, id: string) => (by === 'sector' ? r.sector === id : r.themes.includes(id))
  const fields = ids
    .map((id) => {
      const ka = a.filter((r) => has(r, id)).length
      const kb = b.filter((r) => has(r, id)).length
      const label = by === 'sector' ? id : (THEMES.find((th) => th.id === id)?.label ?? id)
      const from = a.length ? ka / a.length : 0
      const to = b.length ? kb / b.length : 0
      const total = ka + kb
      const flat = Math.abs(to - from) < 0.01 || total < 20
      return { id, label, from, to, ka, kb, total, change: to - from, dir: flat ? 'flat' : to > from ? 'up' : 'down' }
    })
    .filter((f) => f.total > 0)
    .sort((x, y) => y.change - x.change)
  const max = Math.ceil((Math.max(...fields.flatMap((f) => [f.from, f.to])) + 0.03) / 0.05) * 0.05
  const riser = fields[0]
  const faller = fields[fields.length - 1]
  const largest = [...fields].sort((x, y) => y.to - x.to)[0]
  const fmt = (s: number, k: number) => `${Math.round(s * 100)}% · ${k}`
  const def = useMemo(() => {
    if (!t) return null
    const colour = (d: (typeof fields)[number]) => (d.dir === 'up' ? t.glaze : d.dir === 'down' ? t.terracotta : t.tile4)
    return defineChart({
      marks: [
        arrow(fields, { x1: 'from', x2: 'to', y1: 'label', y2: 'label', key: 'id', stroke: colour, strokeWidth: 2.5, headLength: 9, headAngle: 28 }),
        dot(fields, { x: 'from', y: 'label', key: 'id', r: 4, color: 'dir', stroke: t.canvas }),
        // Both numbers after the arrow's far end, in reading order: then → now.
        text(fields, { x: (d) => Math.max(d.from, d.to), y: 'label', key: (d) => `${d.id}-n`, text: (d) => `${fmt(d.from, d.ka)}  →  ${fmt(d.to, d.kb)}`, anchor: 'start', dx: 14, fontSize: 13, fill: t.ink }),
      ],
      scales: {
        x: { scale: scaleLinear().domain([0, max]), grid: { stroke: t.hairline }, axis: { ...axisText, ticks: { values: Array.from({ length: Math.round(max / 0.05) + 1 }, (_, i) => i * 0.05), format: (v: number) => `${Math.round(v * 100)}%` } } },
        y: {
          scale: () => scaleBand<string>().domain(fields.map((f) => f.label)).padding(0.2),
          axis: { tickLabels: { fontSize: 14, fontWeight: (c: { value: string }) => (c.value === sector ? 700 : 400) }, ticks: { line: false } },
        },
      },
      color: { domain: ['up', 'down', 'flat'], range: [t.glaze, t.terracotta, t.tile4] },
      focus: 'nearest-y',
      tooltip: false,
      theme: theme(t, [t.glaze]),
      margin: { left: 250, right: 24 },
    })
  }, [t, JSON.stringify(fields), sector]) // eslint-disable-line react-hooks/exhaustive-deps
  const open = (id: string) => navigate({ to: '/search', search: by === 'sector' ? { sector: id } : { q: THEMES.find((th) => th.id === id)?.query } })
  return (
    <Section
      question={by === 'sector' ? 'Which sectors are rising, and which are fading?' : 'Which themes are rising in the descriptions?'}
      controls={<Segmented label="Fields" value={by} options={[['sector', 'Sectors'], ['theme', 'Themes']]} onChange={onBy} />}
      chart={
        <>
          {t && <Swatches items={[['Rising', t.glaze], ['Fading', t.terracotta], ['About the same, or too few to tell', t.tile4]]} />}
          <div className="mt-3">
            {def ? (
              <Chart
                definition={def}
                renderer={renderer}
                height={fields.length * 30 + 50}
                ariaLabel={`${riser?.label} rose the most, ${faller?.label} fell the most, between ${PERIODS[0]} and ${PERIODS[1]}.`}
                onSelect={(p) => p && open((p.datum as { id: string }).id)}
              />
            ) : (
              <Empty h={fields.length * 30 + 50} />
            )}
          </div>
          <DataTable caption={`Share of labels by ${by}, ${PERIODS[0]} and ${PERIODS[1]}`} head={['Field', PERIODS[0], PERIODS[1]]} rows={fields.map((f) => [f.label, fmt(f.from, f.ka), fmt(f.to, f.kb)])} />
        </>
      }
      caption={`Dot: share of ${by === 'theme' ? 'described startups' : 'labels'} in ${PERIODS[0]} (${a.length}). Arrowhead: share in ${PERIODS[1]} (${b.length}). The numbers read then → now, as share · count. Click a row to open it in the Archive.${by === 'theme' ? ' Themes are read from description keywords, so an estimate.' : ''}`}
      findings={[
        { figure: `+${Math.round((riser?.change ?? 0) * 100)} pts`, text: `${riser?.label} rose the most, from ${fmt(riser.from, riser.ka)} to ${fmt(riser.to, riser.kb)}.` },
        { figure: `${Math.round((faller?.change ?? 0) * 100)} pts`, text: `${faller?.label} fell the most, from ${fmt(faller.from, faller.ka)} to ${fmt(faller.to, faller.kb)}.` },
        { figure: `${Math.round((largest?.to ?? 0) * 100)}%`, text: `of ${by === 'theme' ? 'recent descriptions mention' : 'recent labels go to'} ${largest?.label}, the largest today.` },
      ]}
    />
  )
}

/* ───────────────────────────── Teams ───────────────────────────── */

const CELL = 14
const GAP = 2
const ROWS = 12

/** One waffle of every startup, split into four blocks by team size; a year or sector lights its squares. */
function Teams({
  all,
  years,
  t,
  renderer,
  sector,
  year,
  onYear,
  founders,
}: {
  all: LandscapeRow[]
  years: number[]
  t: Tokens | null
  renderer: ReturnType<typeof motion>
  sector?: string
  year?: number
  onYear: (y: number | undefined) => void
  founders: RepeatFounder[]
}) {
  const navigate = useNavigate()
  const match = (r: LandscapeRow) => (year === undefined || r.year === year) && (!sector || r.sector === sector)
  const filtering = year !== undefined || !!sector
  const blocks = TEAMS.map((label, i) => {
    const list = all.filter((r) => sizeOf(r) === i).sort((x, y) => x.year - y.year || x.month - y.month || x.name.localeCompare(y.name))
    return { label, list, on: list.filter(match).length }
  })
  const scope = all.filter(match)
  const colours = t ? [t.glaze, t.ochre, t.terracotta, t.steel] : []
  const avg = scope.length ? (scope.reduce((a, r) => a + r.founders, 0) / scope.length).toFixed(1) : '0'
  const solo = (list: LandscapeRow[]) => pct(list.filter((r) => sizeOf(r) === 0).length, list.length)
  const [more, setMore] = useState(false)
  const shown = more ? founders : founders.slice(0, 9)
  return (
    <Section
      question="How many founders start a startup?"
      controls={
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="text-[0.9375rem] text-ink-2">Labelled in</span>
          <div role="radiogroup" aria-label="Label year" className="flex flex-wrap gap-1.5">
            {[undefined, ...years].map((y) => (
              <button
                key={y ?? 'all'}
                type="button"
                role="radio"
                aria-checked={year === y}
                onClick={() => onYear(y)}
                className={cn('h-8 rounded-md border px-3 text-sm', year === y ? 'border-ink bg-ink text-canvas' : 'border-edge text-ink hover:bg-surface')}
              >
                {y ?? 'All years'}
              </button>
            ))}
          </div>
        </div>
      }
      chart={
        <div className="flex flex-wrap items-end gap-x-8 gap-y-8">
          {blocks.map((bl, i) => (
            <TeamBlock
              key={bl.label}
              label={bl.label}
              list={bl.list}
              on={bl.on}
              filtering={filtering}
              total={filtering ? scope.length : all.length}
              colour={colours[i]}
              t={t}
              renderer={renderer}
              match={match}
              onOpen={(id) => navigate({ to: '/startups/$id', params: { id } })}
            />
          ))}
        </div>
      }
      caption={`Each square is one startup, ordered by the month it was labelled.${filtering ? ' Filled squares match the chosen year or sector; outlined ones do not.' : ''} Hover a square for its name; click to open it.`}
      findings={[
        { figure: avg, text: `founders on average${filtering ? ' in this selection' : ''}.` },
        { figure: `${solo(scope)}%`, text: `are solo. ${solo(all.filter((r) => r.year === years[0]))}% of the ${years[0]} labels, ${solo(all.filter((r) => r.year >= 2023))}% since 2023.` },
        { figure: founders.length, text: 'people appear on more than one startup.' },
      ]}
    >
      <div className="mt-10 border-t border-edge/60 pt-6">
        <p className="text-[0.9375rem] font-medium text-ink">People named on more than one startup</p>
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
        {founders.length > 9 && (
          <button type="button" onClick={() => setMore((m) => !m)} className="mt-3 min-h-8 text-sm text-glaze underline underline-offset-4">
            {more ? 'Show fewer' : `Show all ${founders.length}`}
          </button>
        )}
        <p className="mt-2 text-[0.8125rem] text-ink-2">Matched on the written name, so a namesake can appear here by mistake.</p>
      </div>
    </Section>
  )
}

function TeamBlock({
  label,
  list,
  on,
  filtering,
  total,
  colour,
  t,
  renderer,
  match,
  onOpen,
}: {
  label: string
  list: LandscapeRow[]
  on: number
  filtering: boolean
  total: number
  colour: string
  t: Tokens | null
  renderer: ReturnType<typeof motion>
  match: (r: LandscapeRow) => boolean
  onOpen: (id: string) => void
}) {
  const cols = Math.max(1, Math.ceil(list.length / ROWS))
  const w = cols * (CELL + GAP)
  const h = ROWS * (CELL + GAP)
  const data = list.map((r) => ({ id: r.id, name: r.name, sector: r.sector, when: `${MONTHS[r.month - 1]} ${r.year}`, one: 1, lit: !filtering || match(r) }))
  const def = useMemo(
    () =>
      t &&
      defineChart({
        marks: [waffleY(data, { y: 'one', key: 'id', unit: 1, columns: cols, gap: GAP, radius: 2, fill: (d) => (d.lit ? colour : t.canvas), stroke: (d) => (d.lit ? t.canvas : t.edge), strokeWidth: 1 })],
        scales: { x: null, y: null },
        tooltip: { use: tooltip, items: [{ field: 'name', label: 'Startup' }, { field: 'sector', label: 'Sector' }, { field: 'when', label: 'Labelled' }] },
        theme: theme(t, [colour]),
        guides: false,
        margin: 0,
      }),
    [t, colour, JSON.stringify(data.map((d) => d.lit))], // eslint-disable-line react-hooks/exhaustive-deps
  )
  const shown = filtering ? on : list.length
  return (
    <figure className="m-0">
      <figcaption className="mb-3">
        <span className="flex items-center gap-2 text-[0.9375rem] text-ink">
          <span aria-hidden className="size-3 rounded-[2px]" style={{ background: colour }} />
          {label}
        </span>
        <span className="mt-1 block">
          <span className="font-display text-[2rem] leading-10 text-ink">{filtering ? `${on} of ${list.length}` : list.length}</span>
          <span className="ms-2 text-[0.9375rem] text-ink">{pct(shown, total)}%</span>
        </span>
      </figcaption>
      <div style={{ width: w, height: h }}>
        {def ? <Chart definition={def} renderer={renderer} width={w} height={h} ariaLabel={`${label}: ${list.length} startups`} onSelect={(p) => p && onOpen((p.datum as { id: string }).id)} /> : null}
      </div>
    </figure>
  )
}

/* ───────────────────────────── Shared ───────────────────────────── */

function DataTable({ caption, head, rows }: { caption: string; head: string[]; rows: (string | number)[][] }) {
  return (
    <table className="sr-only">
      <caption>{caption}</caption>
      <thead>
        <tr>
          {head.map((h) => (
            <th key={h} scope="col">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            {r.map((c, j) => (j === 0 ? <th key={j} scope="row">{c}</th> : <td key={j}>{c}</td>))}
          </tr>
        ))}
      </tbody>
    </table>
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
