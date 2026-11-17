import { barX, barY, cell, defineChart, lineY, stack } from '@tanstack/charts'
import { motion } from '@tanstack/charts/motion'
import { Chart } from '@tanstack/charts/react/core'
import { scaleBand } from '@tanstack/charts/scales/band'
import { scaleLinear } from '@tanstack/charts/scales/linear'
import { tooltip } from '@tanstack/charts/tooltip'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { scaleLinear as d3Linear } from 'd3-scale'
import { Check, ChevronDown } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import { SectorSwatch } from '@/components/athar/tile-mark'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { getLandscapeRows, type LandscapeRow } from '#/server/api/app'
import { THEMES } from '#/shared/themes'

type Search = { sector?: string; theme?: string }

export const Route = createFileRoute('/_app/landscape')({
  validateSearch: (s: Record<string, unknown>): Search => ({
    sector: typeof s.sector === 'string' && s.sector ? s.sector : Array.isArray(s.sector) && typeof s.sector[0] === 'string' ? s.sector[0] : undefined,
    theme: typeof s.theme === 'string' && THEMES.some((t) => t.id === s.theme) ? s.theme : undefined,
  }),
  loader: () => getLandscapeRows(),
  component: LandscapePage,
})

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const LAGS = ['Same year', '1 year', '2–3 years', '4+ years'] as const
const TEAMS = ['1 founder', '2 founders', '3 founders', '4 or more'] as const
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0)

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

/** Four clearly different glazes for ordered categories, read left to right in the legend (fast → slow, small → large). */
const ramp = (t: Tokens) => [t.glaze, t.ochre, t.terracotta, t.tile4]
const theme = (t: Tokens, palette: string[]) => ({ foreground: t.ink, muted: t.ink2, grid: t.hairline, background: t.canvas, palette })
const axisText = { tickLabels: { fontSize: 13 } }

// Landscape: four questions the registry can answer, each with its finding and one chart. One filter: the sector.
function LandscapePage() {
  const { rows: all, founders } = Route.useLoaderData()
  const search = Route.useSearch()
  const navigate = useNavigate({ from: '/landscape' })
  const t = useTokens()
  const renderer = useMemo(() => motion({ transition: { type: 'spring', stiffness: 220, damping: 28, mass: 1 } }), [])
  const sector = search.sector
  const rows = sector ? all.filter((r) => r.sector === sector) : all
  const years = useMemo(() => [...new Set(all.map((r) => r.year))].sort(), [all])
  const sectors = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of all) m.set(r.sector, (m.get(r.sector) ?? 0) + 1)
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }, [all])
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
          <p className="mt-3 max-w-[48rem] text-lg leading-8 text-ink">
            What {rows.length} labelled startups{sector ? ` in ${sector}` : ''} say about how the scene works: how fast the label comes, what they build, who builds it, and when.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <SectorPicker sectors={sectors} value={sector} onChange={(s) => setSearch({ sector: s })} />
          <button type="button" onClick={() => downloadCsv(all)} className="min-h-9 text-[0.9375rem] text-glaze underline underline-offset-4">
            Download the data (CSV)
          </button>
        </div>
      </header>

      {/* Two independent columns, so a tall panel never leaves a hole beside a short one. */}
      <div className="mt-10 grid items-start gap-6 xl:grid-cols-2">
        <div className="grid gap-6">
          <Lag rows={rows} years={years} t={t} renderer={renderer} />
          <Teams rows={rows} years={years} t={t} renderer={renderer} founders={sector ? founders.filter((f) => f.startups.some((s) => rows.some((r) => r.id === s.id))) : founders} />
        </div>
        <div className="grid gap-6">
          <Themes rows={rows} years={years} t={t} renderer={renderer} selected={search.theme ?? 'ai'} onSelect={(id) => setSearch({ theme: id === 'ai' ? undefined : id })} sector={sector} />
          <Rhythm rows={rows} years={years} t={t} renderer={renderer} />
        </div>
      </div>

      <p className="mt-8 max-w-[60rem] text-sm leading-6 text-ink-2">
        Everything here comes from the registry rows: founding year, label month, founders listed and the startup&apos;s own description. Themes are read from description keywords, so they are an estimate, and they only see startups that describe themselves. The registry says nothing about funding, revenue or survival.
      </p>
    </main>
  )
}

type PanelProps = { rows: LandscapeRow[]; years: number[]; t: Tokens | null; renderer: ReturnType<typeof motion> }

function Panel({ id, question, finding, children, note }: { id: string; question: string; finding: React.ReactNode; children: React.ReactNode; note?: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex min-w-0 flex-col rounded-lg border border-edge/60 bg-surface/40 p-6">
      <h2 id={id} className="font-sans text-[0.9375rem] font-medium text-ink-2">
        {question}
      </h2>
      <p className="mt-2 font-display text-[1.75rem] leading-9 text-ink">{finding}</p>
      <div className="mt-5 min-h-0 flex-1">{children}</div>
      {note && <p className="mt-3 text-sm leading-6 text-ink-2">{note}</p>}
    </section>
  )
}

const Empty = ({ h }: { h: number }) => <div style={{ height: h }} />

/** How long from founding to the label, per label year. */
function Lag({ rows, years, t, renderer }: PanelProps) {
  const bucket = (r: LandscapeRow) => {
    const d = r.founded === null ? null : r.year - r.founded
    return d === null ? null : d <= 0 ? LAGS[0] : d === 1 ? LAGS[1] : d <= 3 ? LAGS[2] : LAGS[3]
  }
  const data = years.flatMap((y) => LAGS.map((lag) => ({ year: String(y), lag, count: rows.filter((r) => r.year === y && bucket(r) === lag).length })))
  const same = rows.filter((r) => bucket(r) === LAGS[0]).length
  const within1 = rows.filter((r) => bucket(r) === LAGS[0] || bucket(r) === LAGS[1]).length
  const def = useMemo(
    () =>
      t &&
      defineChart({
        marks: [barY(data, { x: 'year', y: 'count', color: 'lag', key: (d) => `${d.year}-${d.lag}`, layout: stack({ order: [...LAGS], offset: 'normalize' }), inset: 6 })],
        scales: {
          x: { scale: () => scaleBand<string>().padding(0.12), axis: axisText },
          y: { scale: scaleLinear, grid: { stroke: t.hairline }, axis: { ...axisText, ticks: { format: (v: number) => `${Math.round(v * 100)}%`, count: 4 } } },
        },
        color: { domain: [...LAGS], range: ramp(t) },
        focus: 'group-x',
        tooltip: { use: tooltip, sort: 'color-domain', items: [{ channel: 'x' }, { channel: 'y', text: (p: { datum: { count: number } }) => `${p.datum.count} startups` }] },
        theme: theme(t, ramp(t)),
        margin: { left: 44 },
      }),
    [t, JSON.stringify(data)], // eslint-disable-line react-hooks/exhaustive-deps
  )
  return (
    <Panel
      id="lag-h"
      question="How soon after founding does the label come?"
      finding={
        <>
          {pct(same, rows.length)}% get it the year they are founded; {pct(within1, rows.length)}% within a year.
        </>
      }
      note="Each bar is one label year, split by how old the startups were when labelled. Founding is known to the year only."
    >
      <Legend items={LAGS.map((l, i) => [l, t ? ramp(t)[i] : 'transparent'])} />
      {def ? <Chart definition={def} renderer={renderer} height={300} ariaLabel="Share of startups by years from founding to label, per label year" /> : <Empty h={300} />}
    </Panel>
  )
}

/** Which themes appear in descriptions, and how the selected one moves over time. */
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
  const firstYear = trend.find((d) => d.n >= 10)
  const lastYear = [...trend].reverse().find((d) => d.n >= 10)
  const bars = useMemo(
    () =>
      t &&
      defineChart({
        marks: [barX(counts, { y: 'label', x: 'count', key: 'id', fill: (d) => (d.id === sel.id ? t.glaze : t.tile4), inset: 3 })],
        scales: {
          y: { scale: () => scaleBand<string>().padding(0.15), axis: { tickLabels: { fontSize: 13 }, ticks: { line: false } } },
          x: { scale: scaleLinear, grid: { stroke: t.hairline }, axis: axisText },
        },
        focus: 'nearest-y',
        tooltip: { use: tooltip, items: [{ channel: 'y' }, { channel: 'x', text: (p: { datum: { count: number } }) => `${p.datum.count} of ${described.length} described startups` }] },
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
          y: { scale: scaleLinear, nice: true, grid: { stroke: t.hairline }, axis: { ...axisText, ticks: { format: (v: number) => `${Math.round(v * 100)}%`, count: 3 } } },
        },
        focus: 'nearest-x',
        tooltip: { use: tooltip, items: [{ channel: 'x' }, { channel: 'y', text: (p: { datum: { k: number; n: number } }) => `${p.datum.k} of ${p.datum.n} described` }] },
        theme: theme(t, [t.glaze]),
        margin: { left: 44 },
      }),
    [t, JSON.stringify(trend)], // eslint-disable-line react-hooks/exhaustive-deps
  )
  const share = pct(described.filter((r) => r.themes.includes(sel.id)).length, described.length)
  return (
    <Panel
      id="themes-h"
      question="What do they build?"
      finding={
        counts.length ? (
          <>
            {sel.label} appears in {share}% of descriptions
            {firstYear && lastYear && firstYear !== lastYear ? `: ${Math.round((firstYear.share ?? 0) * 100)}% in ${firstYear.year}, ${Math.round((lastYear.share ?? 0) * 100)}% in ${lastYear.year}` : ''}.
          </>
        ) : (
          'Too few descriptions to read themes.'
        )
      }
      note={
        <>
          Click a theme to follow it over time. Read from description keywords: an estimate.{' '}
          <Link to="/search" search={{ q: sel.query, sector }}>
            Open “{sel.label}” in the Archive
          </Link>
        </>
      }
    >
      {bars ? (
        <Chart
          definition={bars}
          renderer={renderer}
          height={Math.max(160, counts.length * 26 + 30)}
          ariaLabel="Startups mentioning each theme"
          onSelect={(p) => p && onSelect((p.datum as { id: string }).id)}
        />
      ) : (
        <Empty h={300} />
      )}
      <p className="mt-4 text-sm text-ink-2">Share of each year&apos;s described startups that mention {sel.label}. Years with fewer than 10 descriptions are left out.</p>
      {line ? <Chart definition={line} renderer={renderer} height={150} ariaLabel={`Share mentioning ${sel.label} by label year`} /> : <Empty h={150} />}
    </Panel>
  )
}

/** Team size per label year, and the people behind more than one startup. */
function Teams({ rows, years, t, renderer, founders }: PanelProps & { founders: { name: string; startups: { id: string; name: string; year: number }[] }[] }) {
  const size = (r: LandscapeRow) => (r.founders <= 1 ? TEAMS[0] : r.founders === 2 ? TEAMS[1] : r.founders === 3 ? TEAMS[2] : TEAMS[3])
  const data = years.flatMap((y) => TEAMS.map((team) => ({ year: String(y), team, count: rows.filter((r) => r.year === y && size(r) === team).length })))
  const early = rows.filter((r) => r.year === years[0])
  const late = rows.filter((r) => r.year >= years[years.length - 3])
  const [more, setMore] = useState(false)
  const def = useMemo(
    () =>
      t &&
      defineChart({
        marks: [barY(data, { x: 'year', y: 'count', color: 'team', key: (d) => `${d.year}-${d.team}`, layout: stack({ order: [...TEAMS], offset: 'normalize' }), inset: 6 })],
        scales: {
          x: { scale: () => scaleBand<string>().padding(0.12), axis: axisText },
          y: { scale: scaleLinear, grid: { stroke: t.hairline }, axis: { ...axisText, ticks: { format: (v: number) => `${Math.round(v * 100)}%`, count: 4 } } },
        },
        color: { domain: [...TEAMS], range: ramp(t) },
        focus: 'group-x',
        tooltip: { use: tooltip, sort: 'color-domain', items: [{ channel: 'x' }, { channel: 'y', text: (p: { datum: { count: number } }) => `${p.datum.count} startups` }] },
        theme: theme(t, ramp(t)),
        margin: { left: 44 },
      }),
    [t, JSON.stringify(data)], // eslint-disable-line react-hooks/exhaustive-deps
  )
  const avg = (list: LandscapeRow[]) => (list.length ? (list.reduce((a, r) => a + r.founders, 0) / list.length).toFixed(1) : '0')
  const shown = more ? founders : founders.slice(0, 6)
  return (
    <Panel
      id="teams-h"
      question="Who builds them?"
      finding={
        <>
          Teams average {avg(rows)} founders; solo founders went from {pct(early.filter((r) => r.founders <= 1).length, early.length)}% in {years[0]} to {pct(late.filter((r) => r.founders <= 1).length, late.length)}% since {years[years.length - 3]}.
        </>
      }
    >
      <Legend items={TEAMS.map((l, i) => [l, t ? ramp(t)[i] : 'transparent'])} />
      {def ? <Chart definition={def} renderer={renderer} height={240} ariaLabel="Share of startups by team size, per label year" /> : <Empty h={240} />}
      <div className="mt-5 border-t border-edge/60 pt-4">
        <p className="text-[0.9375rem] text-ink">
          {founders.length} {founders.length === 1 ? 'person is' : 'people are'} named on more than one startup
        </p>
        <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
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
        {founders.length > 6 && (
          <button type="button" onClick={() => setMore((m) => !m)} className="mt-2 min-h-8 text-sm text-glaze underline underline-offset-4">
            {more ? 'Show fewer' : `Show all ${founders.length}`}
          </button>
        )}
        <p className="mt-2 text-sm text-ink-2">Matched on the written name, so a namesake can appear here by mistake.</p>
      </div>
    </Panel>
  )
}

/** When labels are granted: month by year, and how complete each year's records are. */
function Rhythm({ rows, years, t, renderer }: PanelProps) {
  const grid = years.flatMap((y) => MONTHS.map((m, i) => ({ year: String(y), month: m, count: rows.filter((r) => r.year === y && r.month === i + 1).length })))
  const peak = Math.max(1, ...grid.map((g) => g.count))
  const byYear = years.map((y) => ({ y, n: rows.filter((r) => r.year === y).length, months: new Set(rows.filter((r) => r.year === y).map((r) => r.month)).size }))
  const top = [...byYear].sort((a, b) => b.n - a.n)[0]
  const last = byYear[byYear.length - 1]
  const complete = years.map((y) => {
    const list = rows.filter((r) => r.year === y)
    return { year: String(y), share: list.length ? list.filter((r) => r.described).length / list.length : 0, n: list.length }
  })
  const heat = useMemo(
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
  const comp = useMemo(
    () =>
      t &&
      defineChart({
        marks: [barY(complete, { x: 'year', y: 'share', key: 'year', fill: t.tile4, inset: 10 })],
        scales: {
          x: { scale: () => scaleBand<string>().padding(0.1), axis: axisText },
          y: { scale: () => scaleLinear().domain([0, 1]), axis: { ...axisText, ticks: { values: [0, 0.5, 1], format: (v: number) => `${Math.round(v * 100)}%` } }, grid: { stroke: t.hairline } },
        },
        focus: 'nearest-x',
        tooltip: { use: tooltip, items: [{ channel: 'x' }, { channel: 'y', label: 'With a description', text: (p: { datum: { share: number; n: number } }) => `${Math.round(p.datum.share * 100)}% of ${p.datum.n}` }] },
        theme: theme(t, [t.tile4]),
        margin: { left: 48 },
      }),
    [t, JSON.stringify(complete)], // eslint-disable-line react-hooks/exhaustive-deps
  )
  return (
    <Panel
      id="rhythm-h"
      question="When are labels granted?"
      finding={
        <>
          {top?.y} was the busiest year with {top?.n}; {last?.y} had {last?.n}, in {last?.months} {last?.months === 1 ? 'month' : 'months'}.
        </>
      }
      note="Darker green means more labels that month. Below, how many of each year's records describe the startup: recent years are thin, so read recent trends with care."
    >
      {heat ? <Chart definition={heat} renderer={renderer} height={Math.max(200, years.length * 34 + 30)} ariaLabel="Labels granted per month and year" /> : <Empty h={270} />}
      <p className="mt-4 text-sm text-ink-2">Records with a description, by label year</p>
      {comp ? <Chart definition={comp} renderer={renderer} height={130} ariaLabel="Share of records with a description, by label year" /> : <Empty h={130} />}
    </Panel>
  )
}

function Legend({ items }: { items: [string, string][] }) {
  return (
    <ul className="mb-2 flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-ink">
      {items.map(([label, colour]) => (
        <li key={label} className="flex items-center gap-2">
          <span aria-hidden className="size-3 rounded-[2px]" style={{ background: colour }} />
          {label}
        </li>
      ))}
    </ul>
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
