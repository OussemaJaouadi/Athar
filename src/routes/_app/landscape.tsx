import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'

import { SectorSwatch, TileMark, sectorStyle } from '@/components/athar/tile-mark'
import { cn } from '@/lib/utils'
import { getLandscapeRows, type LandscapeRow } from '#/server/api/app'

type Search = { sector?: string[]; from?: number; to?: number; year?: number }

const yearParam = (v: unknown) => (typeof v === 'number' ? v : typeof v === 'string' && /^\d{4}$/.test(v) ? Number(v) : undefined)
const sectorList = (v: unknown) => {
  const list = (Array.isArray(v) ? v : [v]).filter((x): x is string => typeof x === 'string' && x.length > 0)
  return list.length ? [...new Set(list)].slice(0, 5) : undefined
}

export const Route = createFileRoute('/_app/landscape')({
  validateSearch: (s: Record<string, unknown>): Search => ({ sector: sectorList(s.sector), from: yearParam(s.from), to: yearParam(s.to), year: yearParam(s.year) }),
  loader: () => getLandscapeRows(),
  component: LandscapePage,
})

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const OTHER = 'other'
const OTHER_FILL = 'color-mix(in oklab, var(--ink-2) 42%, var(--canvas))'
// The five glazes, for a compared sector whose own glaze is already taken.
const COMPARE = ['var(--glaze)', 'var(--ochre)', 'var(--tile-manganese)', 'var(--tile-terracotta)', 'var(--tile-steel)']
// Compare lines differ by dash as well as colour, so colour is never the only cue.
const DASHES = ['', '9 5', '2 4', '12 4 2 4', '5 3']
const ZOOMS = [5, 8] as const
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** Every year from the first founding to the latest label: the chart's full range. */
function yearSpan(rows: LandscapeRow[]) {
  const founded = rows.map((r) => r.founded).filter((y): y is number => y !== null)
  const y0 = Math.min(...founded)
  const y1 = Math.max(...founded, ...rows.map((r) => r.year))
  return Array.from({ length: y1 - y0 + 1 }, (_, i) => y0 + i)
}

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(1200)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, width] as const
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

// Landscape: how the scene grew, read through a window of years that pans and zooms.
function LandscapePage() {
  const rows = Route.useLoaderData()
  const search = Route.useSearch()
  const navigate = useNavigate({ from: '/landscape' })
  const selected = search.sector ?? []
  const comparing = selected.length > 1
  const active = selected.length === 1 ? selected[0] : undefined
  const [full, setFull] = useState(false)
  const [hoverYear, setHoverYear] = useState<number | undefined>()
  const [hoverSector, setHoverSector] = useState<string | undefined>()
  const timer = useRef<number | undefined>(undefined)

  const years = useMemo(() => (rows.length ? yearSpan(rows) : []), [rows])
  const sectors = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of rows) m.set(r.sector, (m.get(r.sector) ?? 0) + 1)
    return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([name]) => name)
  }, [rows])

  // Each compared sector keeps its own glaze; only a later one that shares a glaze moves to the first free one.
  const assigned = new Map<string, string>()
  for (const n of selected) {
    const own = sectorStyle(n).glaze.fill
    const used = new Set(assigned.values())
    assigned.set(n, used.has(own) ? (COMPARE.find((c) => !used.has(c)) ?? own) : own)
  }
  const colour = (n: string) => assigned.get(n) ?? sectorStyle(n).glaze.fill

  const cur = selected.length ? rows.filter((r) => selected.includes(r.sector)) : rows
  const readYear = hoverYear ?? search.year

  const later = (fn: () => void, ms = 80) => {
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(fn, ms)
  }
  const setSearch = (patch: Partial<Search>) => navigate({ search: (p) => ({ ...p, ...patch }), resetScroll: false, replace: true })
  const pick = (name: string) => {
    if (!selected.includes(name) && selected.length >= 5) return setFull(true)
    setFull(false)
    const next = selected.includes(name) ? selected.filter((n) => n !== name) : [...selected, name]
    navigate({ search: (p) => ({ ...p, sector: next.length ? next : undefined }), resetScroll: false })
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (search.year !== undefined) setSearch({ year: undefined })
      else if (selected.length) setSearch({ sector: undefined })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }) // eslint-disable-line react-hooks/exhaustive-deps

  if (rows.length === 0) {
    return (
      <main className="px-4 py-16 sm:px-8">
        <h1 className="text-[2.75rem] leading-[3rem]">Nothing to count yet</h1>
        <p className="mt-2 text-ink">The registry has not been collected. An operator runs Collect first.</p>
      </main>
    )
  }

  return (
    <main className="grid flex-1 grid-cols-[minmax(0,1fr)] gap-x-10 gap-y-10 px-4 pt-10 pb-14 sm:px-8 xl:grid-cols-[minmax(0,1fr)_23rem] 2xl:gap-x-14">
      <section aria-labelledby="land-h" className="min-w-0">
        <h1 id="land-h" className="text-[2.75rem] leading-[3rem]">
          Landscape
        </h1>
        <Sentence cur={cur} active={active} selected={selected} colour={colour} />
        <Chart
          rows={rows}
          years={years}
          sectors={sectors}
          selected={selected}
          colour={colour}
          highlight={hoverSector}
          search={search}
          setSearch={setSearch}
          onHoverYear={(y) => later(() => setHoverYear(y), y === undefined ? 0 : 80)}
        />
        <Latest cur={cur} />
      </section>

      <SectorList
        rows={rows}
        sectors={sectors}
        selected={selected}
        comparing={comparing}
        colour={colour}
        year={readYear}
        full={full}
        onPick={pick}
        onClear={() => (setFull(false), setSearch({ sector: undefined }))}
        onHover={(s) => later(() => setHoverSector(s), s === undefined ? 0 : 80)}
        active={active}
      />
    </main>
  )
}

type Series = { key: string; label: string; fill: string; total: number; per: number[]; cum: number[] }

/**
 * Founded so far (stacked bands, one band, or one line per compared sector) and labelled so far, through a window
 * of years. ‹ › and the arrow keys pan it, the zoom shows five years, eight or all, and dragging pans too.
 * Running totals stay true at the window's left edge: what came before is counted, and said.
 */
function Chart({
  rows,
  years,
  sectors,
  selected,
  colour,
  highlight,
  search,
  setSearch,
  onHoverYear,
}: {
  rows: LandscapeRow[]
  years: number[]
  sectors: string[]
  selected: string[]
  colour: (s: string) => string
  highlight?: string
  search: Search
  setSearch: (p: Partial<Search>) => void
  onHoverYear: (y: number | undefined) => void
}) {
  const [box, width] = useWidth<HTMLDivElement>()
  const compact = width < 720
  const comparing = selected.length > 1
  const active = selected.length === 1 ? selected[0] : undefined
  const cur = selected.length ? rows.filter((r) => selected.includes(r.sector)) : rows
  const first = years[0]
  const last = years[years.length - 1]

  // The window: from the URL, else the last 8 years (5 on a phone).
  const span = Math.min(years.length, search.from !== undefined && search.to !== undefined ? search.to - search.from + 1 : compact ? 5 : 8)
  const to = Math.min(last, Math.max(first + span - 1, search.to ?? last))
  const from = to - span + 1
  const all = from === first && to === last
  const zoom = all ? 'all' : String(span)
  const shown = years.filter((y) => y >= from && y <= to)
  const off = years.indexOf(from)

  const move = (d: number) => {
    const n = to - from
    const t = Math.min(last, Math.max(first + n, to + d))
    setSearch({ from: t - n, to: t })
  }
  const setZoom = (z: string) => {
    if (z === 'all') return setSearch({ from: first, to: last })
    const n = Number(z)
    const t = Math.max(first + n - 1, Math.min(last, search.year !== undefined ? Math.max(search.year, to) : to))
    setSearch({ from: t - n + 1, to: t })
  }
  const zoomBy = (d: number) => {
    const order = [...ZOOMS.map(String), 'all']
    setZoom(order[Math.min(order.length - 1, Math.max(0, order.indexOf(zoom) + d))])
  }

  const seriesOf = (list: LandscapeRow[], key: (r: LandscapeRow) => number | null) => {
    const per = years.map((y) => list.filter((r) => key(r) === y).length)
    let run = 0
    return { per, cum: per.map((n) => (run += n)) }
  }
  const make = (key: string, label: string, fill: string, list: LandscapeRow[]): Series => ({ key, label, fill, total: list.length, ...seriesOf(list, (r) => r.founded) })
  const top5 = sectors.slice(0, 5)
  const series: Series[] = comparing
    ? selected.map((s) => make(s, s, colour(s), rows.filter((r) => r.sector === s)))
    : active
      ? [make(active, active, sectorStyle(active).glaze.fill, cur)]
      : [
          ...top5.map((s) => make(s, s, sectorStyle(s).glaze.fill, rows.filter((r) => r.sector === s))),
          make(OTHER, `${sectors.length - 5} other sectors`, OTHER_FILL, rows.filter((r) => !top5.includes(r.sector))),
        ]
  const f = seriesOf(cur, (r) => r.founded)
  const l = seriesOf(cur, (r) => r.year)
  const firstLabel = rows.reduce((a, r) => (r.year * 12 + r.month < a.year * 12 + a.month ? r : a), rows[0])

  // Geometry over the window only.
  const GUT = compact ? 12 : 236
  const AH = compact ? 260 : 340
  const BH = compact ? 96 : 120
  const cw = Math.max(240, width - GUT)
  const step = cw / shown.length
  const xi = (i: number) => step * (i - off + 0.5)
  const win = (arr: number[]) => arr.slice(off, off + shown.length)
  const yMax = Math.max(1, ...(comparing ? series.flatMap((s) => win(s.cum)) : [...win(f.cum), ...win(l.cum)]))
  const top = yMax * 1.12
  const ya = (v: number) => 28 + (AH - 28) * (1 - v / top)
  const tickStep = (() => {
    const raw = yMax / 5
    const p = 10 ** Math.floor(Math.log10(Math.max(1, raw)))
    return [1, 2, 2.5, 5, 10].map((m) => m * p).find((s) => s >= raw) ?? 10 * p
  })()
  const barTop = AH + 40
  const bMax = Math.max(1, ...(comparing ? series.flatMap((s) => win(s.per)) : [...win(f.per), ...win(l.per)]))
  const yb = (v: number) => barTop + 22 + (BH - 22) * (1 - v / bMax)
  const H = barTop + BH + 4
  const path = (arr: number[]) => shown.map((_, k) => `${xi(off + k)},${ya(arr[off + k])}`).join(' L')
  const lastK = off + shown.length - 1

  // Stacked bands (not in compare).
  let base = years.map(() => 0)
  const bands = comparing
    ? []
    : series.map((s) => {
        const lo = base
        const hi = base.map((v, i) => v + s.cum[i])
        base = hi
        const back = shown.map((_, k) => `${xi(off + k)},${ya(lo[off + k])}`).reverse().join(' L')
        return { s, d: `M${path(hi)} L${back} Z`, edge: `M${path(hi)}`, lo, hi }
      })
  const lit = highlight && series.some((s) => s.key === highlight) ? highlight : undefined
  const dim = (k: string) => (lit && lit !== k ? 0.45 : 1)

  // Names at the right end, ink on canvas, pushed apart so they never touch.
  const ends = (comparing ? series.map((s, i) => ({ s, i, y: ya(s.cum[lastK]) })) : bands.map((b, i) => ({ s: b.s, i, y: (ya(b.lo[lastK]) + ya(b.hi[lastK])) / 2 }))).sort((a, b) => a.y - b.y)
  for (let i = 1; i < ends.length; i++) ends[i].y = Math.max(ends[i].y, ends[i - 1].y + 20)
  for (let i = ends.length - 2; i >= 0; i--) ends[i].y = Math.min(ends[i].y, ends[i + 1].y - 20)

  // Labelled so far: from the label's first month when it is in view.
  const li = years.indexOf(firstLabel.year)
  const ruleX = xi(li - 1) + ((firstLabel.month - 1) / 12) * step
  const ruleIn = firstLabel.year >= from && firstLabel.year <= to && ruleX >= 0
  const lpts = shown.map((y, k) => ({ y, x: xi(off + k), v: l.cum[off + k] })).filter((p) => p.y >= firstLabel.year)
  const lline = [...(ruleIn ? [{ x: ruleX, v: 0 }] : []), ...lpts]
  const before = cur.filter((r) => r.founded !== null && r.founded < from).length
  const every = shown.length > 9 ? 2 : 1
  const labelAt = (k: number) => k === shown.length - 1 || (shown.length - 1 - k) % every === 0

  const pinned = search.year !== undefined && search.year >= from && search.year <= to ? search.year : undefined
  const [hoverY, setHoverY] = useState<number | undefined>()
  const drag = useRef<{ x: number; moved: number } | null>(null)

  const onKey = (e: React.KeyboardEvent) => {
    const k = e.key
    if (k === 'ArrowLeft') move(-1)
    else if (k === 'ArrowRight') move(1)
    else if (k === '-' || k === '_') zoomBy(1)
    else if (k === '+' || k === '=') zoomBy(-1)
    else if (k === '0') setZoom('all')
    else return
    e.preventDefault()
  }
  const pickYear = (y: number) => setSearch({ year: search.year === y ? undefined : y })
  const hoverAt = (y: number | undefined) => (setHoverY(y), onHoverYear(y))
  const bw = Math.min(22, step * 0.26)
  const navBtn = cn('grid place-items-center rounded-md border border-edge text-ink hover:bg-surface disabled:border-hairline disabled:text-ink-3', compact ? 'size-11' : 'size-8')

  return (
    <div className="mt-8">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <p className="text-[0.9375rem] text-ink-2">{comparing ? 'Founded so far, by sector' : 'Founded so far, and how many hold the label'}</p>
        <div className="flex flex-wrap items-center gap-3">
          <div role="radiogroup" aria-label="Zoom" className="flex rounded-md border border-edge p-0.5">
            {[...ZOOMS.map((z) => [String(z), `${z} years`] as const), ['all', 'All'] as const].map(([v, text]) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={zoom === v}
                onClick={() => setZoom(v)}
                className={cn('rounded-[4px] px-3 text-sm', compact ? 'h-10' : 'h-8', zoom === v ? 'bg-ink text-canvas' : 'text-ink hover:bg-surface')}
              >
                {text}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5" role="group" aria-label="Move the window">
            <button type="button" aria-label="Earlier years" disabled={from === first} onClick={() => move(-1)} className={navBtn}>
              <ChevronLeft className="size-4" aria-hidden />
            </button>
            <span className="min-w-[7.5rem] text-center text-sm text-ink tabular-nums" aria-live="polite">
              {from} – {to}
            </span>
            <button type="button" aria-label="Later years" disabled={to === last} onClick={() => move(1)} className={navBtn}>
              <ChevronRight className="size-4" aria-hidden />
            </button>
          </div>
        </div>
      </div>

      <div
        ref={box}
        tabIndex={0}
        role="group"
        aria-label={`Growth chart, ${from} to ${to}. Left and right arrows move the window, minus and plus zoom, 0 shows all years.`}
        onKeyDown={onKey}
        className="relative mt-4 rounded-sm outline-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-glaze"
      >
        <svg
          role="img"
          aria-label={`Founded so far and labelled so far, ${from} to ${to}.`}
          width={width}
          height={H}
          className="block touch-pan-y overflow-visible select-none"
          onPointerDown={(e) => (drag.current = { x: e.clientX, moved: 0 })}
          onPointerMove={(e) => {
            if (!drag.current || all) return
            const d = Math.round((drag.current.x - e.clientX) / step)
            if (d !== drag.current.moved) {
              move(d - drag.current.moved)
              drag.current.moved = d
            }
          }}
          onPointerUp={() => setTimeout(() => (drag.current = null))}
          onPointerLeave={() => ((drag.current = null), hoverAt(undefined))}
        >
          {Array.from({ length: Math.floor(top / tickStep) }, (_, k) => (k + 1) * tickStep)
            .filter((v) => v <= yMax * 1.05)
            .map((v) => (
              <g key={v}>
                <line x1={0} x2={cw} y1={ya(v) + 0.5} y2={ya(v) + 0.5} className="stroke-hairline" strokeDasharray="2 4" />
                <text x={0} y={ya(v) - 6} className="fill-ink-3 font-mono text-[13px]">
                  {v}
                </text>
              </g>
            ))}

          {bands.map(({ s, d, edge }) =>
            active ? (
              <g key={s.key}>
                <path d={d} style={{ fill: s.fill, fillOpacity: 0.28 }} />
                <path d={edge} fill="none" style={{ stroke: s.fill }} strokeWidth={2.5} strokeLinejoin="round" />
              </g>
            ) : (
              <path key={s.key} d={d} style={{ fill: s.fill, opacity: dim(s.key) }} className="stroke-canvas" strokeWidth={1} strokeLinejoin="round" />
            ),
          )}
          {comparing &&
            series.map((s, i) => (
              <path key={s.key} d={`M${path(s.cum)}`} fill="none" style={{ stroke: s.fill, opacity: dim(s.key) }} strokeWidth={3} strokeDasharray={DASHES[i]} strokeLinejoin="round" strokeLinecap="round" />
            ))}
          <line x1={0} x2={cw} y1={AH + 0.5} y2={AH + 0.5} className="stroke-edge" />

          {before > 0 && (
            <text x={0} y={14} className="fill-ink-2 font-sans text-[13px]">
              {before} founded before {from}, counted in the totals
            </text>
          )}

          {ruleIn && (
            <>
              <line x1={ruleX} x2={ruleX} y1={22} y2={H} className="stroke-edge" strokeDasharray="3 3" />
              <text x={ruleX + 8} y={before > 0 ? 34 : 14} className="fill-ink-2 font-sans text-[13px]">
                {compact ? `Label begins, ${firstLabel.year}` : `The Startup Label begins, ${MONTHS[firstLabel.month - 1]} ${firstLabel.year}`}
              </text>
            </>
          )}

          {!comparing && (
            <>
              <path d={`M${lline.map((p) => `${p.x},${ya(p.v)}`).join(' L')}`} fill="none" className="stroke-ink" strokeWidth={2.5} strokeLinejoin="round" />
              {lpts.map((p) => (
                <circle key={p.y} cx={p.x} cy={ya(p.v)} r={4} className="fill-ink stroke-canvas" strokeWidth={2} />
              ))}
              {/* The numbers, on the chart: founded so far above the edge, labelled so far on a canvas chip by its dot. */}
              {shown.map((y, k) =>
                labelAt(k) ? (
                  <text key={y} x={xi(off + k)} y={ya(f.cum[off + k]) - 10} textAnchor="middle" className="fill-ink font-mono text-[13px]">
                    {f.cum[off + k]}
                  </text>
                ) : null,
              )}
              {lpts.map((p) =>
                labelAt(shown.indexOf(p.y)) && Math.abs(ya(p.v) - ya(f.cum[years.indexOf(p.y)])) > 22 ? (
                  <g key={p.y} transform={`translate(${p.x + 9} ${ya(p.v) + 6})`}>
                    <rect x={-3} y={-13} width={String(p.v).length * 8.2 + 8} height={19} rx={3} className="fill-canvas" />
                    <text x={1} y={1} className="fill-ink font-mono text-[13px]">
                      {p.v}
                    </text>
                  </g>
                ) : null,
              )}
            </>
          )}

          {!compact &&
            ends.map(({ s, i, y }) => (
              <g key={s.key} transform={`translate(${cw + 14} ${y})`} style={{ opacity: dim(s.key) }}>
                {comparing ? <line x1={0} x2={18} y1={0} y2={0} style={{ stroke: s.fill }} strokeWidth={3} strokeDasharray={DASHES[i]} /> : <rect x={0} y={-6} width={12} height={12} rx={2} style={{ fill: s.fill }} />}
                <text x={comparing ? 26 : 20} y={4.5} className="fill-ink font-sans text-[13px]">
                  {s.label}
                </text>
              </g>
            ))}

          {/* New each year */}
          <text x={0} y={barTop + 4} className="fill-ink-2 font-sans text-[13px]">
            {comparing ? 'Founded each year' : 'New each year: founded (grey bar), labelled (light bar)'}
          </text>
          {shown.map((y, k) => {
            const i = off + k
            const cx = xi(i)
            if (comparing) {
              const gw = Math.min(14, (step * 0.7) / series.length)
              return (
                <g key={y}>
                  {series.map((s, j) =>
                    s.per[i] > 0 ? <rect key={s.key} x={cx - (gw * series.length) / 2 + j * gw} y={yb(s.per[i])} width={Math.max(2, gw - 2)} height={barTop + BH - yb(s.per[i])} style={{ fill: s.fill, opacity: dim(s.key) }} /> : null,
                  )}
                </g>
              )
            }
            return (
              <g key={y}>
                {f.per[i] > 0 && (
                  <>
                    <rect x={cx - bw - 3} y={yb(f.per[i])} width={bw} height={barTop + BH - yb(f.per[i])} className="fill-tile-4" />
                    {!compact && labelAt(k) && (
                      <text x={cx - bw / 2 - 3} y={yb(f.per[i]) - 6} textAnchor="middle" className="fill-ink-2 font-mono text-[13px]">
                        {f.per[i]}
                      </text>
                    )}
                  </>
                )}
                {l.per[i] > 0 && (
                  <>
                    <rect x={cx + 3} y={yb(l.per[i])} width={bw} height={barTop + BH - yb(l.per[i])} className="fill-ink" />
                    {!compact && labelAt(k) && (
                      <text x={cx + bw / 2 + 3} y={yb(l.per[i]) - 6} textAnchor="middle" className="fill-ink font-mono text-[13px]">
                        {l.per[i]}
                      </text>
                    )}
                  </>
                )}
              </g>
            )
          })}
          <line x1={0} x2={cw} y1={barTop + BH + 0.5} y2={barTop + BH + 0.5} className="stroke-edge" />

          {pinned !== undefined && <line x1={xi(years.indexOf(pinned))} x2={xi(years.indexOf(pinned))} y1={28} y2={barTop + BH} className="stroke-glaze" strokeWidth={2} />}
          {hoverY !== undefined && hoverY !== pinned && <line x1={xi(years.indexOf(hoverY))} x2={xi(years.indexOf(hoverY))} y1={28} y2={barTop + BH} className="stroke-ink-2" strokeDasharray="3 3" />}
          {shown.map((y, k) => (
            <rect key={y} x={k * step} y={0} width={step} height={H} fill="transparent" className="cursor-pointer" onPointerEnter={() => hoverAt(y)} onClick={() => (drag.current?.moved ? undefined : pickYear(y))} />
          ))}
        </svg>

        {/* Year ticks are buttons: Tab reaches each, Enter focuses that year. */}
        <div className="relative h-11" style={{ width: cw }}>
          {shown.map((y, k) => (
            <button
              key={y}
              type="button"
              aria-pressed={pinned === y}
              onClick={() => pickYear(y)}
              onFocus={() => hoverAt(y)}
              onBlur={() => hoverAt(undefined)}
              className={cn('absolute top-1 h-9 -translate-x-1/2 rounded-md px-2 text-sm tabular-nums', pinned === y ? 'bg-glaze font-medium text-glaze-ink' : 'text-ink hover:bg-surface')}
              style={{ left: xi(off + k), minWidth: Math.min(56, step - 4) }}
            >
              {compact ? `’${String(y).slice(2)}` : y}
            </button>
          ))}
        </div>

        {compact && (
          <ul className="mt-2 grid gap-y-2 text-sm">
            {(comparing ? series : [...series].reverse()).map((s, i) => (
              <li key={s.key} className="flex items-center gap-2.5">
                {comparing ? (
                  <svg width={20} height={6} aria-hidden>
                    <line x1={0} x2={20} y1={3} y2={3} style={{ stroke: s.fill }} strokeWidth={3} strokeDasharray={DASHES[i]} />
                  </svg>
                ) : (
                  <span className="size-3 shrink-0 rounded-[2px]" style={{ background: s.fill }} />
                )}
                <span className="text-ink">{s.label}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* For screen readers: the chart's numbers as a table. */}
      <table className="sr-only">
        <caption>Founded so far and labelled so far by year{selected.length ? `, ${selected.join(', ')}` : ''}</caption>
        <thead>
          <tr>
            <th scope="col">Year</th>
            <th scope="col">Founded so far</th>
            <th scope="col">Labelled so far</th>
          </tr>
        </thead>
        <tbody>
          {years.map((y, i) => (
            <tr key={y}>
              <th scope="row">{y}</th>
              <td>{f.cum[i]}</td>
              <td>{l.cum[i]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** The sector list: filter, legend and the numbers. With no year in focus it shows totals; with one, that year. */
function SectorList({
  rows,
  sectors,
  selected,
  comparing,
  colour,
  year,
  full,
  onPick,
  onClear,
  onHover,
  active,
}: {
  rows: LandscapeRow[]
  sectors: string[]
  selected: string[]
  comparing: boolean
  colour: (s: string) => string
  year?: number
  full: boolean
  onPick: (s: string) => void
  onClear: () => void
  onHover: (s: string | undefined) => void
  active?: string
}) {
  const count = (s: string, test: (r: LandscapeRow) => boolean) => rows.filter((r) => r.sector === s && test(r)).length
  const cols = year === undefined ? 'grid-cols-[minmax(0,1fr)_3.5rem]' : 'grid-cols-[minmax(0,1fr)_4rem_4rem]'
  return (
    <aside aria-labelledby="sectors-h" className="xl:pt-2">
      <div className={cn('grid min-h-10 items-center gap-x-2 border-b border-edge px-2 pb-1 text-sm text-ink-2', cols)}>
        <span className="flex items-baseline gap-3">
          <h2 id="sectors-h" className="font-sans text-sm font-medium text-ink">
            Sectors
          </h2>
          {selected.length > 0 && (
            <button type="button" onClick={onClear} className="min-h-8 text-glaze underline underline-offset-4">
              Clear
            </button>
          )}
        </span>
        {year === undefined ? (
          <span className="text-end">Total</span>
        ) : (
          <>
            <span className="text-end">In {year}</span>
            <span className="text-end">By {year}</span>
          </>
        )}
      </div>
      <ul onPointerLeave={() => onHover(undefined)}>
        {sectors.map((s) => {
          const on = selected.includes(s)
          const moved = comparing && on && colour(s) !== sectorStyle(s).glaze.fill
          const inYear = year === undefined ? 0 : count(s, (r) => r.founded === year)
          return (
            <li key={s} className={cn('relative grid min-h-9 items-center gap-x-2 border-b border-hairline px-2', cols, on && 'bg-surface')} onPointerEnter={() => onHover(s)}>
              {on && <span aria-hidden className="absolute inset-y-0 start-0 w-0.5 bg-glaze" />}
              <button type="button" role="checkbox" aria-checked={on} onClick={() => onPick(s)} onFocus={() => onHover(s)} className="flex min-h-9 min-w-0 items-center gap-2.5 text-start">
                {moved ? <span className="size-[15px] shrink-0 rounded-[3px]" style={{ background: colour(s) }} /> : <SectorSwatch sector={s} size={15} />}
                <span className={cn('truncate text-[0.9375rem]', selected.length && !on ? 'text-ink-2' : 'text-ink')}>{s}</span>
              </button>
              {year === undefined ? (
                <span className="text-end font-mono text-sm text-ink tabular-nums">{count(s, () => true)}</span>
              ) : (
                <>
                  <span className="text-end font-mono text-sm tabular-nums">
                    {inYear > 0 ? (
                      <Link to="/search" search={{ sector: s, founded: year }} className="underline underline-offset-4">
                        {inYear}
                      </Link>
                    ) : (
                      <span className="text-ink-3">0</span>
                    )}
                  </span>
                  <span className="text-end font-mono text-sm text-ink tabular-nums">{count(s, (r) => r.founded !== null && r.founded <= year)}</span>
                </>
              )}
            </li>
          )
        })}
      </ul>
      <p className="mt-3 px-2 text-sm leading-6 text-ink-2" aria-live="polite">
        {full ? <span className="me-1 text-ink">You can compare up to five.</span> : selected.length === 0 && <span className="me-1">Pick up to five to compare.</span>}
        {year === undefined ? 'Pick a year on the chart to see it here.' : `“In ${year}” opens those startups in the Archive.`} Founding years come from the registry, so only startups that later received the label are counted; recent years are incomplete.
      </p>
      <div className="mt-4 flex flex-col gap-2 px-2 text-[0.9375rem]">
        {active && (
          <>
            <Link to="/search" search={{ sector: active }}>
              See the {rows.filter((r) => r.sector === active).length} in the Archive
            </Link>
            <Link to="/" search={{ draft: `${active}: ` }}>
              Check an idea in {active}
            </Link>
          </>
        )}
        <button type="button" onClick={() => downloadCsv(rows)} className="min-h-8 self-start text-glaze underline underline-offset-4">
          Download the data (CSV)
        </button>
      </div>
    </aside>
  )
}

function Named({ name, colour }: { name: string; colour?: string }) {
  return (
    <span className="whitespace-nowrap">
      {colour ? <span aria-hidden className="me-1.5 inline-block size-3 rounded-[2px]" style={{ background: colour }} /> : <span className="me-1.5 inline-block align-[-1px]"><SectorSwatch sector={name} size={13} /></span>}
      {name}
    </span>
  )
}

function Sentence({ cur, active, selected, colour }: { cur: LandscapeRow[]; active?: string; selected: string[]; colour: (s: string) => string }) {
  const cls = 'mt-4 max-w-[60rem] font-display text-[1.375rem] leading-9 text-ink'
  if (selected.length > 1) {
    const size = selected.map((n) => [n, cur.filter((r) => r.sector === n).length] as const).sort((a, b) => b[1] - a[1])
    return (
      <p className={cls}>
        Comparing{' '}
        {selected.map((n, i) => (
          <span key={n}>
            {i > 0 && (i === selected.length - 1 ? ' and ' : ', ')}
            <Named name={n} colour={colour(n)} />
          </span>
        ))}
        . {size[0][0]} is the largest, with {size[0][1]}; {size[size.length - 1][0]} the smallest, with {size[size.length - 1][1]}.
      </p>
    )
  }
  const known = cur.filter((r) => r.founded !== null)
  const per = new Map<number, number>()
  for (const r of known) per.set(r.founded!, (per.get(r.founded!) ?? 0) + 1)
  const ys = [...per.keys()].sort((a, b) => a - b)
  const first = ys[0]
  const firstN = per.get(first) ?? 0
  const [peak, peakN] = [...per.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0] ?? [0, 0]
  const before = known.filter((r) => r.founded! < 2019).length
  return (
    <p className={cls}>
      {active ? <Named name={active} /> : 'The registry'} grew from {plural(firstN, 'startup', 'startups')} founded in {first} to {cur.length} today. {before === 0 ? 'None was' : `${before} ${before === 1 ? 'was' : 'were'}`} founded
      before the label existed. Founding peaked in {peak}, with {peakN}.
    </p>
  )
}

// The one place the page names startups: the newest labels in the current selection.
function Latest({ cur }: { cur: LandscapeRow[] }) {
  const six = [...cur].sort((a, b) => b.year - a.year || b.month - a.month || a.name.localeCompare(b.name)).slice(0, 6)
  return (
    <section aria-labelledby="latest-h" className="mt-10 border-t border-edge pt-4">
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
              {MONTHS[r.month - 1].slice(0, 3)} {r.year}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
