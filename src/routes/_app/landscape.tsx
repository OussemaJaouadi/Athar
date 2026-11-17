import { areaY, defineChart, ruleX, ruleY } from '@tanstack/charts'
import { crosshair } from '@tanstack/charts/crosshair'
import { brushX, type BrushRange, type BrushXChange } from '@tanstack/charts/interaction/brush'
import { controlledSignal } from '@tanstack/charts/interaction/signal'
import { interactiveColorLegend } from '@tanstack/charts/legend'
import { motion } from '@tanstack/charts/motion'
import { Chart } from '@tanstack/charts/react/core'
import { scaleLinear } from '@tanstack/charts/scales/linear'
import { tooltip } from '@tanstack/charts/tooltip'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { Check, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import { SectorSwatch, TileMark, sectorStyle } from '@/components/athar/tile-mark'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { getLandscapeRows, type LandscapeRow } from '#/server/api/app'

type Measure = 'founded' | 'labelled'
type Win = { start: number; end: number }
type Search = { sector?: string[]; measure?: Measure; from?: number; to?: number }

const yearParam = (v: unknown) => (typeof v === 'number' ? v : typeof v === 'string' && /^\d{4}(\.\d+)?$/.test(v) ? Number(v) : undefined)
const sectorList = (v: unknown) => {
  const list = (Array.isArray(v) ? v : [v]).filter((x): x is string => typeof x === 'string' && x.length > 0)
  return list.length ? [...new Set(list)].slice(0, 6) : undefined
}

export const Route = createFileRoute('/_app/landscape')({
  validateSearch: (s: Record<string, unknown>): Search => ({
    sector: sectorList(s.sector),
    measure: s.measure === 'labelled' ? 'labelled' : undefined,
    from: yearParam(s.from),
    to: yearParam(s.to),
  }),
  loader: () => getLandscapeRows(),
  component: LandscapePage,
})

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const OTHER = 'Other sectors'
const PRESETS = [3, 5, 8] as const

// x is a year as a number; labelled data has monthly steps (2021.25 = April 2021).
const fmtX = (measure: Measure) => (x: number) => {
  const y = Math.floor(x + 1e-6)
  if (measure === 'founded') return String(y)
  const m = Math.round((x - y) * 12)
  return `${MONTHS[Math.min(11, m)]} ${y}`
}

/** Athar's tokens as real colours: SVG paint attributes cannot read CSS variables, so read them and follow the theme. */
function useTokens() {
  const read = () => {
    if (typeof document === 'undefined') return null
    const s = getComputedStyle(document.documentElement)
    const v = (n: string) => s.getPropertyValue(n).trim()
    return {
      glazes: [v('--glaze'), v('--ochre'), v('--tile-manganese'), v('--tile-terracotta'), v('--tile-steel')],
      other: v('--tile-4'),
      ink: v('--ink'),
      ink2: v('--ink-2'),
      hairline: v('--hairline'),
      edge: v('--edge'),
      canvas: v('--canvas'),
      raised: v('--surface-raised'),
      glaze: v('--glaze'),
    }
  }
  // Starts empty on the server and the first client paint alike, so hydration matches; filled after mount.
  const [t, setT] = useState<ReturnType<typeof read>>(null)
  useEffect(() => {
    const update = () => setT(read())
    update()
    const mo = new MutationObserver(update)
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] })
    const mq = matchMedia('(prefers-color-scheme: dark)')
    mq.addEventListener('change', update)
    return () => (mo.disconnect(), mq.removeEventListener('change', update))
  }, [])
  return t
}

const SECTOR_INDEX: Record<string, number> = {}
function glazeIndex(sector: string) {
  // sectorStyle's glaze order is the five glazes; find which one this sector uses.
  if (SECTOR_INDEX[sector] !== undefined) return SECTOR_INDEX[sector]
  const fills = ['var(--glaze)', 'var(--ochre)', 'var(--tile-manganese)', 'var(--tile-terracotta)', 'var(--tile-steel)']
  return (SECTOR_INDEX[sector] = Math.max(0, fills.indexOf(sectorStyle(sector).glaze.fill)))
}

type Point = { x: number; series: string; value: number }

// Landscape: how the labelled scene grew. One chart you can zoom and pan, an overview to drag, filters above.
function LandscapePage() {
  const rows = Route.useLoaderData()
  const search = Route.useSearch()
  const navigate = useNavigate({ from: '/landscape' })
  const tokens = useTokens()
  const measure: Measure = search.measure ?? 'founded'
  const chosen = search.sector ?? []

  const sectors = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of rows) m.set(r.sector, (m.get(r.sector) ?? 0) + 1)
    return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  }, [rows])

  // Series: the sectors picked in the filter, else the five largest plus everyone else.
  const seriesNames = chosen.length ? chosen : [...sectors.slice(0, 5).map(([s]) => s), OTHER]
  const seriesOf = (r: LandscapeRow) => (chosen.length ? (chosen.includes(r.sector) ? r.sector : null) : seriesNames.includes(r.sector) ? r.sector : OTHER)
  const scoped = rows.filter((r) => seriesOf(r) !== null)

  // x positions: every founding year, or every label month.
  const xOf = (r: LandscapeRow) => (measure === 'founded' ? r.founded : r.year + (r.month - 1) / 12)
  const xs = useMemo(() => {
    if (measure === 'founded') {
      const ys = rows.map((r) => r.founded).filter((y): y is number => y !== null)
      return Array.from({ length: Math.max(...ys) - Math.min(...ys) + 1 }, (_, i) => Math.min(...ys) + i)
    }
    const ms = rows.map((r) => r.year * 12 + r.month - 1)
    const a = Math.min(...ms)
    return Array.from({ length: Math.max(...ms) - a + 1 }, (_, i) => (a + i - ((a + i) % 12)) / 12 + ((a + i) % 12) / 12)
  }, [rows, measure])
  const extent: [number, number] = [xs[0], xs[xs.length - 1]]

  const points = useMemo(() => {
    const out: Point[] = []
    for (const s of seriesNames) {
      const own = scoped.filter((r) => seriesOf(r) === s)
      let run = 0
      for (const x of xs) {
        run += own.filter((r) => {
          const v = xOf(r)
          return v !== null && Math.abs(v - x) < 1e-6
        }).length
        out.push({ x, series: s, value: run })
      }
    }
    return out
  }, [scoped, xs, seriesNames.join('|'), measure]) // eslint-disable-line react-hooks/exhaustive-deps
  const totals = useMemo(() => xs.map((x) => ({ x, value: points.filter((p) => p.x === x).reduce((a, p) => a + p.value, 0) })), [points, xs])

  // The window: URL when given, else the last eight years (founding) or everything (labels).
  const clamp = (w: Win): Win => {
    const span = Math.min(extent[1] - extent[0], Math.max(measure === 'founded' ? 2 : 1, w.end - w.start))
    const end = Math.min(extent[1], Math.max(extent[0] + span, w.end))
    return { start: end - span, end }
  }
  const initial = clamp(search.from !== undefined && search.to !== undefined ? { start: search.from, end: search.to } : measure === 'founded' ? { start: extent[1] - 7, end: extent[1] } : { start: extent[0], end: extent[1] })
  const [win, setWin] = useState(initial)
  useEffect(() => setWin(initial), [measure, search.from, search.to]) // eslint-disable-line react-hooks/exhaustive-deps
  const commit = (w: Win) => {
    const c = clamp(w)
    setWin(c)
    const r = (n: number) => Math.round(n * 100) / 100
    navigate({ search: (p) => ({ ...p, from: r(c.start), to: r(c.end) }), resetScroll: false, replace: true })
  }

  const [visible, setVisible] = useState<readonly string[]>(seriesNames)
  useEffect(() => setVisible(seriesNames), [seriesNames.join('|')]) // eslint-disable-line react-hooks/exhaustive-deps

  // Each series keeps its sector's glaze; a later series that shares a glaze takes the first free one.
  const colours = useMemo(() => {
    if (!tokens) return seriesNames.map(() => '#888')
    const used = new Set<number>()
    return seriesNames.map((s) => {
      if (s === OTHER) return tokens.other
      let i = glazeIndex(s)
      if (used.has(i)) i = [0, 1, 2, 3, 4].find((k) => !used.has(k)) ?? i
      used.add(i)
      return tokens.glazes[i]
    })
  }, [tokens, seriesNames.join('|')]) // eslint-disable-line react-hooks/exhaustive-deps

  const renderer = useMemo(() => motion({ transition: { type: 'spring', stiffness: 260, damping: 30, mass: 1 }, initial: true }), [])
  const label = measure === 'founded' ? 'Founded so far' : 'Holding the label so far'
  const firstLabel = rows.reduce((a, r) => Math.min(a, r.year + (r.month - 1) / 12), Infinity)

  const detail = useMemo(() => {
    if (!tokens) return null
    const shown = points.filter((p) => p.x >= win.start - 1 && p.x <= win.end + 1)
    return defineChart({
      marks: [
        areaY(shown, {
          id: 'growth',
          x: 'x',
          y: 'value',
          color: 'series',
          key: (p: Point) => `${p.series}-${p.x}`,
          fillOpacity: 0.9,
          stroke: tokens.canvas,
          strokeWidth: 1,
        }),
        ...(firstLabel >= win.start && firstLabel <= win.end && measure === 'founded' ? [ruleX([firstLabel], { stroke: tokens.ink2, strokeDasharray: '4 4' })] : []),
        ruleY([0], { stroke: tokens.edge }),
        crosshair({ x: { label: true, stroke: tokens.ink }, y: false }),
      ],
      scales: {
        x: {
          scale: scaleLinear().domain([win.start, win.end]),
          axis: { tickLabels: { fontSize: 13 }, ticks: { format: fmtX(measure), count: 8 } },
        },
        y: { scale: scaleLinear, nice: true, grid: { stroke: tokens.hairline }, axis: { label: { text: label, fontSize: 13 }, tickLabels: { fontSize: 13 } } },
      },
      color: {
        domain: seriesNames,
        range: colours,
        legend: interactiveColorLegend({ visible: controlledSignal(visible, (next) => setVisible(next)), placement: 'top', hover: 'series', ariaLabel: 'Show or hide a series' }),
      },
      clip: true,
      focus: 'group-x',
      maxFocusDistance: Number.POSITIVE_INFINITY,
      tooltip: { use: tooltip, className: 'athar-tooltip', sort: 'color-domain', items: [{ channel: 'x', text: (p: { xValue: unknown }) => fmtX(measure)(Number(p.xValue)) }, { channel: 'y' }] },
      theme: { foreground: tokens.ink, muted: tokens.ink2, grid: tokens.hairline, background: tokens.canvas, palette: colours },
      margin: { left: 56, right: 16 },
    })
  }, [tokens, points, win, colours, visible, measure]) // eslint-disable-line react-hooks/exhaustive-deps

  const overview = useMemo(() => {
    if (!tokens) return null
    return defineChart({
      marks: [areaY(totals, { x: 'x', y: 'value', fill: tokens.ink2, fillOpacity: 0.35, stroke: tokens.ink2, strokeWidth: 1.5 }), ruleY([0], { stroke: tokens.edge })],
      scales: {
        x: { scale: scaleLinear().domain(extent), axis: { tickLabels: { fontSize: 13 }, ticks: { format: (v: number) => String(Math.round(v)), count: 10 } } },
        y: { scale: scaleLinear, axis: false },
      },
      tooltip: false,
      controls: [
        brushX({
          range: controlledSignal<BrushRange<number>, BrushXChange<number>>(win, (next, { reason }) => (reason.type === 'commit' || reason.type === 'cancel' ? commit(next) : setWin(clamp(next)))),
          keyboard: false,
          ariaLabel: 'Window of years shown above',
          format: fmtX(measure),
          selectionStyle: { fill: tokens.glaze, fillOpacity: 0.18, stroke: tokens.glaze, strokeWidth: 1.5 },
          handleStyle: { fill: tokens.glaze },
        }),
      ],
      theme: { foreground: tokens.ink, muted: tokens.ink2, grid: tokens.hairline, background: tokens.canvas, palette: [tokens.ink2] },
      margin: { left: 56, right: 16, top: 6 },
    })
  }, [tokens, totals, win, measure]) // eslint-disable-line react-hooks/exhaustive-deps

  const setSearch = (patch: Partial<Search>) => navigate({ search: (p) => ({ ...p, ...patch }), resetScroll: false, replace: true })
  const span = Math.round(win.end - win.start)
  const fmt = fmtX(measure)
  const pan = (d: number) => commit({ start: win.start + d, end: win.end + d })
  const preset = (n: number | 'all') => commit(n === 'all' ? { start: extent[0], end: extent[1] } : { start: win.end - n, end: win.end })
  const isAll = win.start <= extent[0] + 1e-6 && win.end >= extent[1] - 1e-6

  const cur = chosen.length ? rows.filter((r) => chosen.includes(r.sector)) : rows
  const byEnd = points.filter((p) => Math.abs(p.x - win.end) < 1e-6 && visible.includes(p.series)).reduce((a, p) => a + p.value, 0)
  const byStart = points.filter((p) => Math.abs(p.x - win.start) < 0.5 / 12 && visible.includes(p.series)).reduce((a, p) => a + p.value, 0)

  if (rows.length === 0) {
    return (
      <main className="px-4 py-16 sm:px-8">
        <h1 className="text-[2.75rem] leading-[3rem]">Nothing to count yet</h1>
        <p className="mt-2 text-ink">The registry has not been collected. An operator runs Collect first.</p>
      </main>
    )
  }

  return (
    <main className="mx-auto w-full max-w-[110rem] flex-1 px-4 pt-10 pb-16 sm:px-8">
      <header className="flex flex-wrap items-end justify-between gap-x-10 gap-y-4">
        <div>
          <h1 className="text-[2.75rem] leading-[3rem]">Landscape</h1>
          <p className="mt-3 max-w-[52rem] text-lg leading-8 text-ink">
            {measure === 'founded' ? 'Startups in the registry by the year they were founded' : 'Startups holding the Startup Label, month by month'}
            {chosen.length ? `, for ${chosen.length === 1 ? chosen[0] : `${chosen.length} sectors`}` : ''}. From {fmt(win.start)} to {fmt(win.end)} the count went from {byStart} to {byEnd}.
          </p>
        </div>
        <button type="button" onClick={() => downloadCsv(rows)} className="min-h-9 text-[0.9375rem] text-glaze underline underline-offset-4">
          Download the data (CSV)
        </button>
      </header>

      {/* Filters */}
      <div role="toolbar" aria-label="Filters" className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-3 border-y border-edge py-3">
        <Segmented
          label="Count by"
          value={measure}
          options={[
            ['founded', 'Year founded'],
            ['labelled', 'Label received'],
          ]}
          onChange={(m) => setSearch({ measure: m === 'labelled' ? 'labelled' : undefined, from: undefined, to: undefined })}
        />
        <SectorPicker sectors={sectors} chosen={chosen} onChange={(next) => setSearch({ sector: next.length ? next : undefined })} />
        <span className="mx-1 hidden h-6 w-px bg-edge sm:block" aria-hidden />
        <Segmented
          label="Show"
          value={isAll ? 'all' : PRESETS.includes(span as 3) ? String(span) : 'custom'}
          options={[...PRESETS.map((n) => [String(n), `${n} years`] as [string, string]), ['all', 'All']]}
          onChange={(v) => preset(v === 'all' ? 'all' : Number(v))}
        />
        <div className="ms-auto flex items-center gap-1.5" role="group" aria-label="Move the window">
          <button type="button" aria-label="Earlier" disabled={win.start <= extent[0] + 1e-6} onClick={() => pan(-1)} className="grid size-9 place-items-center rounded-md border border-edge text-ink hover:bg-surface disabled:border-hairline disabled:text-ink-3">
            <ChevronLeft className="size-4" aria-hidden />
          </button>
          <span className="min-w-[9.5rem] text-center text-[0.9375rem] text-ink tabular-nums" aria-live="polite">
            {fmt(win.start)} – {fmt(win.end)}
          </span>
          <button type="button" aria-label="Later" disabled={win.end >= extent[1] - 1e-6} onClick={() => pan(1)} className="grid size-9 place-items-center rounded-md border border-edge text-ink hover:bg-surface disabled:border-hairline disabled:text-ink-3">
            <ChevronRight className="size-4" aria-hidden />
          </button>
        </div>
      </div>

      <div
        className="athar-chart mt-6"
        style={
          tokens
            ? ({
                '--ts-chart-tooltip-background': tokens.raised,
                '--ts-chart-tooltip-color': tokens.ink,
                '--ts-chart-tooltip-border': `1px solid ${tokens.edge}`,
                '--ts-chart-tooltip-border-radius': '6px',
                '--ts-chart-tooltip-font': '14px "Readex Pro", system-ui, sans-serif',
                '--ts-chart-tooltip-padding': '10px 12px',
              } as React.CSSProperties)
            : undefined
        }
      >
        {detail ? (
          <Chart
            definition={detail}
            renderer={renderer}
            height={460}
            ariaLabel={`${label}, ${fmt(win.start)} to ${fmt(win.end)}, by sector`}
            ariaDescription="Hover or focus for each year's values by sector. Select a point to open those startups in the Archive."
            onSelect={(p) => {
              if (!p) return
              const d = p.datum as Point
              const sector = d.series === OTHER ? undefined : d.series
              const y = Math.floor(d.x + 1e-6)
              navigate({ to: '/search', search: measure === 'founded' ? { sector, founded: y } : { sector, from: y, to: y } })
            }}
          />
        ) : (
          <div className="h-[460px]" />
        )}
        {overview ? <Chart definition={overview} renderer={renderer} height={96} ariaLabel="All years, with the window shown above" /> : <div className="h-24" />}
        <p className="mt-2 text-sm text-ink-2">
          Drag the green window to move through time; drag its edges to zoom in or out. Hover the chart for each year’s numbers; click a point to open those startups. The legend shows or hides a series.
        </p>
      </div>

      <table className="sr-only">
        <caption>{label} by year and series</caption>
        <thead>
          <tr>
            <th scope="col">When</th>
            {seriesNames.map((s) => (
              <th key={s} scope="col">
                {s}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {xs
            .filter((x) => measure === 'founded' || Math.abs(x - Math.round(x)) < 1e-6 || x === xs[xs.length - 1])
            .map((x) => (
              <tr key={x}>
                <th scope="row">{fmt(x)}</th>
                {seriesNames.map((s) => (
                  <td key={s}>{points.find((p) => p.x === x && p.series === s)?.value ?? 0}</td>
                ))}
              </tr>
            ))}
        </tbody>
      </table>

      <Latest cur={cur} />
    </main>
  )
}

function Segmented<T extends string>({ label, value, options, onChange }: { label: string; value: string; options: [T, string][]; onChange: (v: T) => void }) {
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

/** Sector filter: pick up to six to see only them; none picked shows the five largest plus the rest. */
function SectorPicker({ sectors, chosen, onChange }: { sectors: [string, number][]; chosen: string[]; onChange: (next: string[]) => void }) {
  const toggle = (s: string) => onChange(chosen.includes(s) ? chosen.filter((x) => x !== s) : chosen.length >= 6 ? chosen : [...chosen, s])
  return (
    <div className="flex items-center gap-2.5">
      <span className="text-[0.9375rem] text-ink-2">Sectors</span>
      <Popover>
        <PopoverTrigger className="inline-flex h-9 items-center gap-2 rounded-md border border-edge px-3 text-sm text-ink hover:bg-surface">
          {chosen.length === 0 ? 'Five largest + the rest' : chosen.length === 1 ? chosen[0] : `${chosen.length} sectors`}
          <ChevronDown className="size-4" aria-hidden />
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[22rem] p-1">
          <p className="px-2.5 pt-2 pb-1.5 text-[0.8125rem] text-ink-2">Pick up to six. {chosen.length > 0 && `${chosen.length} picked.`}</p>
          <ul role="listbox" aria-multiselectable aria-label="Sectors" className="max-h-[22rem] overflow-y-auto">
            {sectors.map(([s, n]) => {
              const on = chosen.includes(s)
              return (
                <li key={s}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={on}
                    disabled={!on && chosen.length >= 6}
                    onClick={() => toggle(s)}
                    className="flex min-h-9 w-full items-center gap-2.5 rounded-[4px] px-2.5 text-start text-[0.9375rem] text-ink hover:bg-surface disabled:text-ink-3"
                  >
                    <span className={cn('grid size-4 place-items-center rounded-[3px] border', on ? 'border-glaze bg-glaze text-glaze-ink' : 'border-edge')}>{on && <Check className="size-3" aria-hidden />}</span>
                    <SectorSwatch sector={s} size={14} />
                    <span className="flex-1 truncate">{s}</span>
                    <span className="font-mono text-[0.8125rem] text-ink-3">{n}</span>
                  </button>
                </li>
              )
            })}
          </ul>
          {chosen.length > 0 && (
            <button type="button" onClick={() => onChange([])} className="m-1.5 min-h-8 px-1.5 text-sm text-glaze underline underline-offset-4">
              Back to the five largest
            </button>
          )}
        </PopoverContent>
      </Popover>
    </div>
  )
}

function downloadCsv(rows: LandscapeRow[]) {
  const cell = (v: string | number | null) => {
    const s = v === null ? '' : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const lines = [
    ['name', 'sector', 'founded', 'label_month', 'founders', 'website'],
    ...rows.map((r) => [r.name, r.sector, r.founded, `${r.year}-${String(r.month).padStart(2, '0')}`, r.founders, r.website ? 'yes' : 'no']),
  ]
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([lines.map((l) => l.map(cell).join(',')).join('\n')], { type: 'text/csv;charset=utf-8' }))
  a.download = 'athar-startups.csv'
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

// The one place the page names startups: the newest labels in the current selection.
function Latest({ cur }: { cur: LandscapeRow[] }) {
  const six = [...cur].sort((a, b) => b.year - a.year || b.month - a.month || a.name.localeCompare(b.name)).slice(0, 6)
  return (
    <section aria-labelledby="latest-h" className="mt-12 border-t border-edge pt-4">
      <h2 id="latest-h" className="font-sans text-[0.9375rem] font-medium text-ink">
        Latest to receive the label
      </h2>
      <ul className="mt-3 grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-3 2xl:grid-cols-6">
        {six.map((r) => (
          <li key={r.id} className="grid min-w-0 grid-cols-[1.25rem_minmax(0,1fr)] gap-x-2.5">
            <TileMark id={r.id} sector={r.sector} size={20} className="mt-0.5" />
            <Link to="/startups/$id" params={{ id: r.id }} className="truncate text-[0.9375rem] text-ink underline decoration-edge underline-offset-4 hover:decoration-ink">
              {r.name}
            </Link>
            <span className="col-start-2 font-mono text-[0.8125rem] text-ink-3">
              {MONTHS[r.month - 1]} {r.year}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
