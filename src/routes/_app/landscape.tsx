import { type ChartCurve, barY, defineChart, lineY, rect, ruleY, text } from '@tanstack/charts'
import { crosshair } from '@tanstack/charts/crosshair'
import { motion } from '@tanstack/charts/motion'
import { Chart } from '@tanstack/charts/react/core'
import { scaleBand } from '@tanstack/charts/scales/band'
import { scaleLinear } from '@tanstack/charts/scales/linear'
import { tooltip } from '@tanstack/charts/tooltip'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { Check, ChevronDown, LayoutGrid, TrendingUp, Users } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

import { SectorSwatch } from '@/components/athar/tile-mark'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { getLandscapeRows, type LandscapeRow, type RepeatFounder } from '#/server/api/app'
import { THEMES } from '#/shared/themes'

const TABS = [
  { id: 'growth', label: 'Growth', Icon: TrendingUp },
  { id: 'fields', label: 'Fields', Icon: LayoutGrid },
  { id: 'teams', label: 'Teams', Icon: Users },
] as const
type Tab = (typeof TABS)[number]['id']
type Search = { tab?: Tab; sector?: string; by?: 'theme' }

export const Route = createFileRoute('/_app/landscape')({
  validateSearch: (s: Record<string, unknown>): Search => ({
    tab: TABS.some((t) => t.id === s.tab) ? (s.tab as Tab) : undefined,
    sector: typeof s.sector === 'string' && s.sector ? s.sector : Array.isArray(s.sector) && typeof s.sector[0] === 'string' ? s.sector[0] : undefined,
    by: s.by === 'theme' ? 'theme' : undefined,
  }),
  loader: () => getLandscapeRows(),
  component: LandscapePage,
})

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
        {tab === 'fields' && <Fields all={all} t={t} renderer={renderer} by={search.by ?? 'sector'} onBy={(b) => setSearch({ by: b === 'theme' ? 'theme' : undefined })} />}
        {tab === 'teams' && <Teams rows={rows} t={t} renderer={renderer} founders={sector ? founders.filter((f) => f.startups.some((s) => rows.some((r) => r.id === s.id))) : founders} />}
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
            '-mb-px inline-flex min-h-11 items-center gap-2 border-b-2 px-4 text-[0.9375rem] whitespace-nowrap transition-colors motion-reduce:transition-none',
            value === tb.id ? 'border-glaze font-medium text-ink' : 'border-transparent text-ink-2 hover:text-ink',
          )}
        >
          <tb.Icon className="size-4" strokeWidth={1.5} aria-hidden />
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

/* ───────────────────────────── Founding-year buckets ───────────────────────────── */

// Both tabs read founding year: "2015 or earlier", then each year to 2025, as x = 0 … 10.
const FIRST = 2015
const bucketOf = (r: LandscapeRow) => (r.founded === null ? null : Math.max(0, r.founded - FIRST))
const bucketLabel = (i: number) => (i === 0 ? `${FIRST} or earlier` : String(FIRST + i))
const bucketShort = (i: number) => (i === 0 ? `≤${FIRST}` : String(FIRST + i))
const lastBucket = (rows: LandscapeRow[]) => Math.max(0, ...rows.map((r) => bucketOf(r) ?? 0))

/* ───────────────────────────── Fields ───────────────────────────── */

// A bump path: horizontal tangents at every point, so rank changes read as smooth S-steps.
const bumpCurve: ChartCurve = {
  line: (pts) =>
    pts.length === 0
      ? ''
      : pts.reduce((d, [x, y], i) => {
          if (i === 0) return `M${x},${y}`
          const [px, py] = pts[i - 1]
          const mx = (px + x) / 2
          return `${d}C${mx},${py} ${mx},${y} ${x},${y}`
        }, ''),
  area: () => '',
}

type Move = 'up' | 'down' | 'same'

/** A bump ranking: each field's rank by startups founded so far, year by year, in one chart. */
function Fields({ all, t, renderer, by, onBy }: { all: LandscapeRow[]; t: Tokens | null; renderer: ReturnType<typeof motion>; by: 'sector' | 'theme'; onBy: (b: 'sector' | 'theme') => void }) {
  const navigate = useNavigate()
  const base = (by === 'theme' ? all.filter((r) => r.described) : all).filter((r) => bucketOf(r) !== null)
  const n = lastBucket(all) + 1
  const xs = Array.from({ length: n }, (_, i) => i)
  const last = n - 1
  const ids = by === 'sector' ? [...new Set(all.map((r) => r.sector))] : THEMES.map((th) => th.id)
  const has = (r: LandscapeRow, id: string) => (by === 'sector' ? r.sector === id : r.themes.includes(id))
  const fields = ids
    .map((id) => {
      const per = xs.map((i) => base.filter((r) => bucketOf(r) === i && has(r, id)).length)
      let run = 0
      const cum = per.map((v) => (run += v))
      return { id, label: by === 'sector' ? id : (THEMES.find((th) => th.id === id)?.label ?? id), cum, total: run }
    })
    .filter((f) => f.total > 0)
  // Rank at each year among fields with at least one startup so far; ties go to the bigger final total, then the name.
  const rankAt = xs.map((i) =>
    fields
      .filter((f) => f.cum[i] > 0)
      .sort((a, b) => b.cum[i] - a.cum[i] || b.total - a.total || a.label.localeCompare(b.label))
      .map((f) => f.id),
  )
  const ranked = fields.map((f) => {
    const ranks = xs.map((i) => {
      const k = rankAt[i].indexOf(f.id)
      return k < 0 ? null : k + 1
    })
    const first = ranks.findIndex((r) => r !== null)
    const delta = (ranks[first] ?? 0) - (ranks[last] ?? 0)
    const move: Move = delta >= 2 ? 'up' : delta <= -2 ? 'down' : 'same'
    return { ...f, ranks, first, delta, move }
  })
  const N = fields.length
  const points = ranked.flatMap((f) => xs.filter((i) => f.ranks[i] !== null).map((i) => ({ id: f.id, field: f.label, x: i, rank: f.ranks[i]!, cum: f.cum[i], move: f.move })))
  // Findings only from fields big enough for a rank change to mean something.
  const solid = ranked.filter((f) => f.total >= 20)
  const climber = [...solid].sort((a, b) => b.delta - a.delta || b.total - a.total)[0]
  const faller = [...solid].sort((a, b) => a.delta - b.delta || b.total - a.total)[0]
  const always = ranked.find((f) => f.ranks.every((r) => r === 1))
  const ord = (k: number) => `${k}${k % 10 === 1 && k !== 11 ? 'st' : k % 10 === 2 && k !== 12 ? 'nd' : k % 10 === 3 && k !== 13 ? 'rd' : 'th'}`
  const moveText = (f: (typeof ranked)[number]) => (f.delta > 0 ? `▲ ${f.delta}` : f.delta < 0 ? `▼ ${-f.delta}` : '–')
  const open = (id: string) => navigate({ to: '/search', search: by === 'sector' ? { sector: id } : { q: THEMES.find((th) => th.id === id)?.query } })
  const def = useMemo(() => {
    if (!t) return null
    // Highlight comes from the chart's own focus state, so hovering never rebuilds the definition (no focus/rebuild race).
    const focusedId = (c: { focus: { primary?: { datum: unknown } } | null }) => (c.focus?.primary?.datum as { id?: string } | undefined)?.id
    const startLeft = ranked.filter((f) => f.first === 0)
    const lateStart = ranked.filter((f) => f.first > 0)
    return defineChart({
      marks: [
        ...ranked.map((f) =>
          lineY(points.filter((p) => p.id === f.id), {
            id: `l-${f.id}`,
            x: 'x',
            y: 'rank',
            key: (p) => `${p.id}-${p.x}`,
            color: 'move',
            strokeWidth: 2.5,
            curve: bumpCurve,
            points: true,
            states: [{ when: (c) => focusedId(c) === f.id, style: { stroke: t.ink, strokeWidth: 4 }, transition: { type: 'tween', duration: 120 } }],
          }),
        ),
        text(startLeft, { x: () => 0, y: (f) => f.ranks[0]!, text: (f) => `${f.ranks[0]}  ${f.label}`, anchor: 'end', dx: -16, fontSize: 14, fill: t.ink }),
        text(lateStart, { x: (f) => f.first, y: (f) => f.ranks[f.first]!, text: 'label', anchor: 'end', dx: -12, fontSize: 13, fill: t.ink2 }),
        text(ranked, { x: () => last, y: (f) => f.ranks[last]!, text: (f) => `${f.ranks[last]}  ${f.label} · ${f.total} · ${moveText(f)}`, anchor: 'start', dx: 16, fontSize: 14, fill: t.ink }),
        text(xs, { x: (i) => i, y: () => 0, text: (i) => bucketShort(i), fontSize: 13, fill: t.ink2 }),
      ],
      scales: {
        x: { scale: scaleLinear().domain([0, last]), grid: { stroke: t.hairline }, axis: { line: false, tickLabels: { fontSize: 13 }, ticks: { values: xs, format: (v: number) => bucketShort(v), line: false } } },
        y: { scale: scaleLinear().domain([N + 0.6, -0.3]), axis: false },
      },
      color: { domain: ['up', 'down', 'same'], range: [t.glaze, t.terracotta, t.edge] },
      focus: 'nearest',
      maxFocusDistance: 18,
      tooltip: {
        use: tooltip,
        format: (pt: { datum: unknown }) => {
          const d = pt.datum as { field?: string; x?: number; rank?: number; cum?: number }
          return d.field && d.rank ? `${d.field}\nFounded by ${bucketShort(d.x ?? 0)}: ${d.cum}\nRank ${d.rank}` : ''
        },
      },
      theme: theme(t, [t.glaze, t.terracotta, t.edge]),
      margin: { left: 300, right: 380, top: 4, bottom: 4 },
    })
  }, [t, JSON.stringify(points)]) // eslint-disable-line react-hooks/exhaustive-deps
  const h = Math.round((N + 0.9) * 30) + 36
  return (
    <Section
      question={by === 'sector' ? 'Which sectors climbed the ranking as the scene grew?' : 'Which themes climbed the ranking as the scene grew?'}
      controls={<Segmented label="Fields" value={by} options={[['sector', 'Sectors'], ['theme', 'Themes']]} onChange={onBy} />}
      chart={
        <>
          {t && <Swatches items={[['Climbed 2 places or more', t.glaze], ['Fell 2 places or more', t.terracotta], ['Held its place', t.edge]]} />}
          <div className="mt-3">
            {def ? (
              <Chart
                definition={def}
                renderer={renderer}
                height={h}
                ariaLabel={climber ? `${climber.label} climbed from ${ord(climber.ranks[climber.first]!)} to ${ord(climber.ranks[last]!)}.` : 'Ranking by startups founded so far.'}
                onSelect={(pt) => {
                  const id = (pt?.datum as { id?: string } | undefined)?.id
                  if (id) open(id)
                }}
              />
            ) : (
              <Empty h={h} />
            )}
          </div>
          <DataTable caption={`Rank by startups founded so far, by ${by}`} head={[by === 'sector' ? 'Sector' : 'Theme', ...xs.map(bucketLabel)]} rows={ranked.map((f) => [f.label, ...f.ranks.map((r) => (r === null ? '–' : r))])} />
        </>
      }
      caption={`Rank by number of ${by === 'theme' ? 'described ' : ''}startups founded up to each year. Green climbed, red fell, grey held its place. Hover a line to follow it; click to open it in the Archive.${by === 'theme' ? ' Themes come from description keywords: an estimate.' : ''}`}
      findings={[
        climber ? { figure: `${ord(climber.ranks[climber.first]!)} → ${ord(climber.ranks[last]!)}`, text: `${climber.label} climbed the most, to ${climber.total} startups.` } : { figure: '—', text: '' },
        faller ? { figure: `${ord(faller.ranks[faller.first]!)} → ${ord(faller.ranks[last]!)}`, text: `${faller.label} fell the most.` } : { figure: '—', text: '' },
        always ? { figure: '1st', text: `every year: ${always.label}.` } : { figure: ord(1), text: `today: ${ranked.find((f) => f.ranks[last] === 1)?.label}.` },
      ]}
    />
  )
}

/* ───────────────────────────── Teams ───────────────────────────── */

const TEAM_SIZES = ['1 founder', '2 founders', '3 founders', '4 or more'] as const

/** Share bands by founding year: each year a full column, each band one team size, bigger teams brighter. */
function Teams({ rows, t, renderer, founders }: { rows: LandscapeRow[]; t: Tokens | null; renderer: ReturnType<typeof motion>; founders: RepeatFounder[] }) {
  const known = rows.filter((r) => bucketOf(r) !== null)
  const n = lastBucket(rows) + 1
  const xs = Array.from({ length: n }, (_, i) => i)
  const cols = xs.map((i) => {
    const list = known.filter((r) => bucketOf(r) === i)
    const counts = TEAM_SIZES.map((_, s) => list.filter((r) => sizeOf(r) === s).length)
    const avg = list.length ? list.reduce((a, r) => a + r.founders, 0) / list.length : 0
    return { i, n: list.length, counts, avg }
  })
  // Marimekko geometry: each column as wide as the year's count, a gap between, an "All years" column at the end.
  const total = cols.reduce((a, c) => a + c.n, 0)
  const gap = total * 0.0045
  let cursor = 0
  const spans = cols.map((c) => {
    const x1 = cursor
    cursor += c.n + gap
    return { ...c, x1, x2: x1 + c.n, mid: x1 + c.n / 2 }
  })
  const allW = total * 0.012
  const allX1 = cursor + gap * 3
  const allCounts = TEAM_SIZES.map((_, s) => known.filter((r) => sizeOf(r) === s).length)
  const segs = [
    ...spans.flatMap((c) => {
      let below = 0
      return TEAM_SIZES.map((size, s) => {
        const lo = c.n ? below / c.n : 0
        below += c.counts[s]
        const hi = c.n ? below / c.n : 0
        return { key: `${c.i}-${s}`, s, size, x1: c.x1, x2: c.x2, lo, hi, i: c.i, all: false }
      })
    }),
    ...(() => {
      let below = 0
      return TEAM_SIZES.map((size, s) => {
        const lo = below / total
        below += allCounts[s]
        return { key: `all-${s}`, s, size, x1: allX1, x2: allX1 + allW, lo, hi: below / total, i: -1, all: true }
      })
    })(),
  ]
  // One distinct glaze per team size, so each size reads as its own colour, not a shade.
  const ramp = t ? [t.glaze, t.ochre, t.terracotta, t.steel] : []
  const last = n - 1
  const first = cols[0]
  const firstBig = cols.find((c) => c.n >= 30) ?? first
  const recent = [...cols].reverse().find((c) => c.n >= 60) ?? cols[last]
  const solo = (c: (typeof cols)[number]) => (c.n ? Math.round((c.counts[0] / c.n) * 100) : 0)
  const two = known.filter((r) => sizeOf(r) === 1).length
  const [more, setMore] = useState(false)
  const shown = more ? founders : founders.slice(0, 9)
  const def = useMemo(() => {
    if (!t) return null
    // Band names at the left, on the first column's segments, pushed apart where segments are thin.
    const firstSegs = segs.filter((g) => g.i === spans[0].i).map((g) => ({ ...g, at: (g.lo + g.hi) / 2 }))
    for (let i = 1; i < firstSegs.length; i++) firstSegs[i].at = Math.max(firstSegs[i].at, firstSegs[i - 1].at + 0.07)
    firstSegs[firstSegs.length - 1].at = Math.min(firstSegs[firstSegs.length - 1].at, 0.98)
    for (let i = firstSegs.length - 2; i >= 0; i--) firstSegs[i].at = Math.min(firstSegs[i].at, firstSegs[i + 1].at - 0.07)
    const allSegs = segs.filter((g) => g.all).map((g) => ({ ...g, at: (g.lo + g.hi) / 2, n: allCounts[g.s] }))
    const narrow = (c: (typeof spans)[number]) => c.n < total * 0.025
    return defineChart({
      marks: [
        rect(segs, { x1: 'x1', x2: 'x2', y1: 'lo', y2: 'hi', key: 'key', color: 'size', stroke: t.canvas, strokeWidth: 1.5 }),
        ruleY([0.25, 0.5, 0.75], { stroke: t.canvas, strokeWidth: 1, strokeDasharray: '2 4' }),
        text([0.25, 0.5, 0.75], { x: () => 0, y: (v) => v, text: (v) => `${Math.round(v * 100)}%`, anchor: 'end', dx: -10, fontSize: 13, fill: t.ink2 }),
        text(firstSegs, { x: () => 0, y: 'at', text: (g) => g.size, anchor: 'end', dx: -64, fontSize: 14, fill: t.ink }),
        text(allSegs, { x: (g) => g.x2, y: 'at', text: (g) => `${g.n} · ${Math.round((g.hi - g.lo) * 100)}%`, anchor: 'start', dx: 10, fontSize: 13, fill: t.ink }),
        text([0], { x: () => allX1, y: () => 1.05, text: () => 'All years', anchor: 'start', fontSize: 13, fill: t.ink2 }),
        text(spans, { x: 'mid', y: () => 1.05, text: (c) => c.avg.toFixed(1), fontSize: 13, fill: t.ink }),
        text(spans, { x: 'mid', y: () => -0.05, text: (c) => (narrow(c) && c.i > 0 ? `’${String(FIRST + c.i).slice(2)}` : bucketShort(c.i)), fontSize: 13, fill: t.ink }),
        text(spans, { x: 'mid', y: () => -0.11, text: (c) => String(c.n), fontSize: 13, fill: t.ink2 }),
        text([0], { x: () => 0, y: () => 1.05, text: () => 'Average founders', anchor: 'end', dx: -10, fontSize: 13, fill: t.ink2 }),
        text([0], { x: () => 0, y: () => -0.05, text: () => 'Founded', anchor: 'end', dx: -10, fontSize: 13, fill: t.ink2 }),
        text([0], { x: () => 0, y: () => -0.11, text: () => 'Startups', anchor: 'end', dx: -10, fontSize: 13, fill: t.ink2 }),
      ],
      scales: {
        x: { scale: scaleLinear().domain([0, allX1 + allW]), axis: false },
        y: { scale: scaleLinear().domain([-0.14, 1.09]), axis: false },
      },
      focus: 'nearest-x',
      maxFocusDistance: Number.POSITIVE_INFINITY,
      tooltip: {
        use: tooltip,
        format: (pt: { datum: unknown }) => {
          const g = pt.datum as { i?: number; all?: boolean }
          if (g.i === undefined) return ''
          if (g.all) return [`All years · ${total}`, ...TEAM_SIZES.map((size, s) => `${size} · ${allCounts[s]} · ${Math.round((allCounts[s] / total) * 100)}%`).reverse()].join('\n')
          const c = cols.find((cc) => cc.i === g.i)
          if (!c) return ''
          return [`Founded ${bucketLabel(c.i)} · ${c.n}`, ...TEAM_SIZES.map((size, s) => `${size} · ${c.counts[s]} · ${c.n ? Math.round((c.counts[s] / c.n) * 100) : 0}%`).reverse(), `Average ${c.avg.toFixed(1)} founders`].join('\n')
        },
      },
      color: { domain: [...TEAM_SIZES], range: ramp },
      theme: theme(t, ramp),
      margin: { left: 190, right: 110, top: 8, bottom: 4 },
    })
  }, [t, JSON.stringify(cols)]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Section
      question="Do founders start alone or together, and has that changed?"
      chart={
        <>
          <Swatches items={TEAM_SIZES.map((size, i) => [size, ramp[i] ?? 'transparent'] as [string, string])} />
          <div className="mt-3" />
          {def ? <Chart definition={def} renderer={renderer} height={440} ariaLabel={`Solo founders went from ${solo(firstBig)}% of startups founded in ${bucketLabel(firstBig.i)} to ${solo(recent)}% in ${bucketLabel(recent.i)}.`} /> : <Empty h={440} />}
          <DataTable caption="Team size by founding year" head={['Founded', 'Startups', ...TEAM_SIZES, 'Average']} rows={cols.map((c) => [bucketLabel(c.i), c.n, ...c.counts, c.avg.toFixed(1)])} />
        </>
      }
      caption={`Each column is the startups founded that year. A wider column is a bigger year. Each colour is one team size.`}
      findings={[
        { figure: `${solo(firstBig)}% → ${solo(recent)}%`, text: `started solo: founded ${bucketLabel(firstBig.i)} against founded ${bucketLabel(recent.i)}.` },
        { figure: `${firstBig.avg.toFixed(1)} → ${recent.avg.toFixed(1)}`, text: 'average founders per startup, same years.' },
        { figure: `${two} of ${known.length}`, text: 'have two founders, the most common team.' },
      ]}
    >
      <div className="mt-10 border-t border-edge/60 pt-6">
        <p className="text-[0.9375rem] font-medium text-ink">People named on more than one startup · {founders.length}</p>
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
