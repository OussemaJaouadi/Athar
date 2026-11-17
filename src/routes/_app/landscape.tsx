import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'

import { Scroller } from '@/components/athar/scroller'

import { SectorSwatch, TileMark, sectorStyle } from '@/components/athar/tile-mark'
import { cn } from '@/lib/utils'
import { getLandscapeRows, type LandscapeRow } from '#/server/api/app'

export type Basis = 'founded' | 'label'
export type Show = 'each' | 'cum'
export type As = 'count' | 'share'
type Search = { sector?: string[]; basis?: Basis; show?: Show; as?: As; year?: number }

const sectorList = (v: unknown) => {
  const list = (Array.isArray(v) ? v : [v]).filter((x): x is string => typeof x === 'string' && x.length > 0)
  return list.length ? [...new Set(list)].slice(0, 5) : undefined
}

export const Route = createFileRoute('/_app/landscape')({
  validateSearch: (s: Record<string, unknown>): Search => ({
    sector: sectorList(s.sector),
    basis: s.basis === 'label' ? 'label' : undefined,
    show: s.show === 'cum' ? 'cum' : undefined,
    as: s.as === 'share' ? 'share' : undefined,
    year: typeof s.year === 'number' ? s.year : typeof s.year === 'string' && /^\d{4}$/.test(s.year) ? Number(s.year) : undefined,
  }),
  loader: () => getLandscapeRows(),
  component: LandscapePage,
})

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const OTHER = 'other'
// The five glazes, for a compared sector whose own glaze is already taken.
const COMPARE = ['var(--glaze)', 'var(--ochre)', 'var(--tile-manganese)', 'var(--tile-terracotta)', 'var(--tile-steel)']
const OTHER_FILL = 'color-mix(in oklab, var(--ink-2) 48%, var(--canvas))'
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

// Landscape: how the scene grew, from the first founding to today, and what it is made of.
function LandscapePage() {
  const rows = Route.useLoaderData()
  const search = Route.useSearch()
  const selected = search.sector ?? []
  const navigate = useNavigate({ from: '/landscape' })
  const [preview, setPreview] = useState<string | undefined>()
  const [full, setFull] = useState(false)
  const hoverTimer = useRef<number | undefined>(undefined)
  const active = selected.length === 1 ? selected[0] : undefined
  const comparing = selected.length > 1
  // Each compared sector keeps its own glaze; only a later one that shares a glaze moves to the first free one.
  const assigned = new Map<string, string>()
  for (const n of selected) {
    const own = sectorStyle(n).glaze.fill
    const used = new Set(assigned.values())
    assigned.set(n, used.has(own) ? (COMPARE.find((c) => !used.has(c)) ?? own) : own)
  }
  const colour = (name: string) => assigned.get(name) ?? sectorStyle(name).glaze.fill

  const sectors = useMemo(() => {
    const m = new Map<string, { name: string; total: number; before: number }>()
    for (const r of rows) {
      const s = m.get(r.sector) ?? { name: r.sector, total: 0, before: 0 }
      s.total++
      if (r.founded !== null && r.founded < 2019) s.before++
      m.set(r.sector, s)
    }
    return [...m.values()].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name))
  }, [rows])

  const cur = selected.length ? rows.filter((r) => selected.includes(r.sector)) : rows

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selected.length) navigate({ search: (p) => ({ ...p, sector: undefined }), resetScroll: false })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selected.length, navigate])

  if (rows.length === 0) {
    return (
      <main className="px-4 py-16 sm:px-8">
        <h1 className="text-[2.75rem] leading-[3rem]">Nothing to count yet</h1>
        <p className="mt-2 text-ink-2">The registry has not been collected. An operator runs Collect first.</p>
      </main>
    )
  }

  const pick = (name: string) => {
    window.clearTimeout(hoverTimer.current)
    setPreview(undefined)
    if (!selected.includes(name) && selected.length >= 5) return setFull(true)
    setFull(false)
    const next = selected.includes(name) ? selected.filter((n) => n !== name) : [...selected, name]
    navigate({ search: (p) => ({ ...p, sector: next.length ? next : undefined }), resetScroll: false })
  }
  const pin = (year: number | undefined) => navigate({ search: (p) => ({ ...p, year }), resetScroll: false, replace: true })
  const hover = (name: string | undefined) => {
    window.clearTimeout(hoverTimer.current)
    hoverTimer.current = window.setTimeout(() => setPreview(name), name ? 80 : 0)
  }

  return (
    <main className="grid flex-1 grid-cols-[minmax(0,1fr)] gap-x-8 gap-y-10 px-4 pt-10 pb-14 sm:px-8 xl:grid-cols-[minmax(0,1fr)_372px] 2xl:gap-x-14">
      <section className="min-w-0">
        <h1 className="text-[2.75rem] leading-[3rem]">Landscape</h1>
        <Sentence cur={cur} active={active} selected={selected} colour={colour} />
        <Growth rows={rows} sectors={sectors.map((s) => s.name)} selected={selected} highlight={active ? undefined : preview} pinned={search.year} onPin={pin} colour={colour} />
        <Numbers rows={rows} sectors={sectors.map((s) => s.name)} selected={selected} search={search} pinned={search.year} onHover={hover} />
        <Latest cur={cur} />
      </section>

      <aside aria-label="Sectors" className="xl:pt-3">
        <div className="grid grid-cols-[minmax(0,1fr)_3rem_5.5rem] border-b border-hairline px-1.5 pb-2 text-xs whitespace-nowrap text-ink-2">
          <span className="flex gap-3">
            Sector
            {selected.length > 0 && (
              <button type="button" onClick={() => (setFull(false), navigate({ search: (p) => ({ ...p, sector: undefined }), resetScroll: false }))} className="text-glaze hover:underline">
                Clear
              </button>
            )}
          </span>
          <span className="text-end">All</span>
          <span className="text-end">Before 2019</span>
        </div>
        <ul className="sm:columns-2 sm:gap-x-8 xl:columns-1" onPointerLeave={() => hover(undefined)}>
          {sectors.map((s) => (
            <li key={s.name} className="break-inside-avoid">
              <button
                type="button"
                role="checkbox"
                aria-checked={selected.includes(s.name)}
                onClick={() => pick(s.name)}
                onPointerEnter={() => hover(s.name)}
                className={cn(
                  'grid h-[27px] w-full grid-cols-[1.375rem_minmax(0,1fr)_3rem_5.5rem] items-center border-b border-hairline px-1.5 text-start text-[13.5px] transition-opacity duration-150 hover:bg-surface/60 motion-reduce:transition-none',
                  selected.length ? (selected.includes(s.name) ? 'bg-surface' : 'opacity-50') : preview && preview !== s.name && sectors.slice(0, 5).some((t) => t.name === preview) && 'opacity-60',
                )}
              >
                {comparing && selected.includes(s.name) && colour(s.name) !== sectorStyle(s.name).glaze.fill ? <span className="size-[15px] rounded-[3px]" style={{ background: colour(s.name) }} /> : <SectorSwatch sector={s.name} size={15} />}
                <span className="truncate">{s.name}</span>
                <span className="text-end tabular-nums">{s.total}</span>
                <span className="text-end text-ink-2 tabular-nums">{s.before}</span>
              </button>
            </li>
          ))}
        </ul>
        <p className="mt-3.5 px-1.5 text-xs leading-5 text-ink-2">
          {full ? <span className="me-1 text-ochre-text">Compare up to five.</span> : selected.length === 0 && <span className="me-1">Pick up to five sectors to compare.</span>}
          Founding years come from the registry, so only startups that later received the label are counted. Recent years are incomplete.
        </p>
        {active && (
          <p className="mt-5 flex flex-col gap-2 px-1.5 text-sm">
            <Link to="/search" search={{ sector: active }}>
              See the {rows.filter((r) => r.sector === active).length} in the Archive
            </Link>
            <Link to="/" search={{ draft: `${active}: ` }}>
              Check an idea in {active}
            </Link>
          </p>
        )}
      </aside>
    </main>
  )
}

// A round axis step giving four or five lines.
function niceStep(max: number) {
  const raw = max / 5
  const p = 10 ** Math.floor(Math.log10(Math.max(1, raw)))
  return ([1, 2, 5, 10].map((m) => m * p).find((s) => s >= raw) ?? 10 * p) || 1
}

type Band = { key: string; label: string; fill: string; total: number; cum: number[]; per: number[] }

/** Every year from the first founding to the latest label: the shared axis of the chart, the stepper and the table. */
export function yearSpan(rows: LandscapeRow[]) {
  const founded = rows.map((r) => r.founded).filter((y): y is number => y !== null)
  const y0 = Math.min(...founded)
  const y1 = Math.max(...founded, ...rows.map((r) => r.year))
  return Array.from({ length: y1 - y0 + 1 }, (_, i) => y0 + i)
}

/** ‹ year ›: steps the year the chart is read at. With nothing pinned it says "All years". */
function Stepper({ years, pinned, onPin, compact }: { years: number[]; pinned?: number; onPin: (y: number | undefined) => void; compact: boolean }) {
  const i = pinned === undefined ? -1 : years.indexOf(pinned)
  const btn = cn('grid place-items-center rounded-[3px] border border-hairline text-ink hover:bg-surface disabled:opacity-35 disabled:hover:bg-transparent', compact ? 'size-10' : 'size-8')
  return (
    <div className="flex items-center gap-1.5" role="group" aria-label="Year">
      <button type="button" className={btn} aria-label="Previous year" disabled={i === 0} onClick={() => onPin(i < 0 ? years[years.length - 1] : years[i - 1])}>
        <ChevronLeft className="size-4" aria-hidden />
      </button>
      <button
        type="button"
        onClick={() => onPin(undefined)}
        disabled={i < 0}
        aria-label={i < 0 ? 'All years' : `${pinned}, unpin`}
        className="min-w-[5.5rem] text-center text-sm text-ink tabular-nums disabled:cursor-default"
      >
        {i < 0 ? 'All years' : pinned}
      </button>
      <button type="button" className={btn} aria-label="Next year" disabled={i === years.length - 1} onClick={() => onPin(i < 0 ? years[0] : years[i + 1])}>
        <ChevronRight className="size-4" aria-hidden />
      </button>
    </div>
  )
}

/**
 * Founded so far as stacked bands (all sectors) or one band (one sector), labelled so far as a line, and new each year
 * as paired bars. With two to five sectors it compares them: one founded-so-far line each, grouped bars under them.
 */
function Growth({
  rows,
  sectors,
  selected,
  highlight,
  pinned,
  onPin,
  colour,
}: {
  rows: LandscapeRow[]
  sectors: string[]
  selected: string[]
  highlight?: string
  pinned?: number
  onPin: (y: number | undefined) => void
  colour: (s: string) => string
}) {
  const box = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(1200)
  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const [hoverY, setHoverY] = useState<number | null>(null)

  const comparing = selected.length > 1
  const active = selected.length === 1 ? selected[0] : undefined
  const cur = selected.length ? rows.filter((r) => selected.includes(r.sector)) : rows
  const years = yearSpan(rows)
  const firstLabel = rows.reduce((a, r) => (r.year * 12 + r.month < a.year * 12 + a.month ? r : a), rows[0])

  const series = (list: LandscapeRow[], key: (r: LandscapeRow) => number | null) => {
    const per = years.map((y) => list.filter((r) => key(r) === y).length)
    let run = 0
    return { per, cum: per.map((n) => (run += n)) }
  }
  const band = (key: string, label: string, fill: string, list: LandscapeRow[]): Band => ({ key, label, fill, total: list.length, ...series(list, (r) => r.founded) })
  const top5 = sectors.slice(0, 5)
  const bands: Band[] = comparing
    ? selected.map((s) => band(s, s, colour(s), rows.filter((r) => r.sector === s)))
    : active
      ? [band(active, active, sectorStyle(active).glaze.fill, cur)]
      : [
          ...top5.map((s) => band(s, s, sectorStyle(s).glaze.fill, rows.filter((r) => r.sector === s))),
          band(OTHER, `${sectors.length - 5} other sectors`, OTHER_FILL, rows.filter((r) => !top5.includes(r.sector))),
        ]
  const f = series(cur, (r) => r.founded)
  const l = series(cur, (r) => r.year)

  const compact = width < 720
  const GUT = comparing && !compact ? 230 : 24
  const AH = compact ? 240 : 330
  const BH = compact ? 80 : 110
  const cw = Math.max(200, width - GUT)
  const step = cw / years.length
  const x = (i: number) => step * (i + 0.5)
  const yMax = Math.max(1, ...(comparing ? bands.map((b) => b.total) : [f.cum[f.cum.length - 1], l.cum[l.cum.length - 1]]))
  const tick = niceStep(yMax)
  const top = yMax * 1.06
  const ya = (v: number) => 20 + (AH - 20) * (1 - v / top)
  const barTop = AH + 44
  const bMax = Math.max(1, ...(comparing ? bands.flatMap((b) => b.per) : [...f.per, ...l.per]))
  const yb = (v: number) => barTop + 18 + (BH - 18) * (1 - v / bMax)
  const H = barTop + BH + 26
  const pts = (arr: number[]) => arr.map((v, i) => `${x(i)},${ya(v)}`).join(' L')

  // Stacked band paths (bands and single-sector modes).
  let base = years.map(() => 0)
  const paths = comparing
    ? []
    : bands.map((b) => {
        const lo = base
        const hi = base.map((v, i) => v + b.cum[i])
        base = hi
        const down = lo.map((v, i) => `${x(i)},${ya(v)}`).reverse().join(' L')
        return { b, d: `M${pts(hi)} L${down} Z`, edge: `M${pts(hi)}`, lo, hi }
      })
  // A series' value at any x, so a label can sit where the band actually is.
  const at = (arr: number[], px: number) => {
    const t = Math.min(years.length - 1, Math.max(0, px / step - 0.5))
    const i = Math.floor(t)
    const j = Math.min(arr.length - 1, i + 1)
    return arr[i] + (arr[j] - arr[i]) * (t - i)
  }
  const lit = highlight && bands.some((b) => b.key === highlight) ? highlight : undefined
  const dim = (key: string) => (lit && lit !== key ? 0.3 : 1)

  const li = years.indexOf(firstLabel.year)
  const startX = x(li - 1) + ((firstLabel.month - 1) / 12) * step
  const linePts = [[startX, ya(0)] as const, ...l.cum.map((v, i) => [x(i), ya(v)] as const).slice(li)]
  const bw = Math.min(16, step * 0.28)
  const gap = 3
  const last = years.length - 1
  const hov = hoverY === null ? -1 : years.indexOf(hoverY)
  const pin = pinned === undefined ? -1 : years.indexOf(pinned)
  const read = hov >= 0 ? hov : pin
  const pk = years.indexOf(2020)
  const p22 = Math.max(0, years.indexOf(2022))

  // Compare: names at the right end of each line, pushed apart so they never touch.
  const ends = bands.map((b) => ({ b, y: ya(b.cum[last]) })).sort((a, c) => a.y - c.y)
  for (let i = 1; i < ends.length; i++) ends[i].y = Math.max(ends[i].y, ends[i - 1].y + 18)

  const stepBy = (d: number) => onPin(years[Math.min(last, Math.max(0, (pin < 0 ? (d > 0 ? -1 : years.length) : pin) + d))])
  const onKey = (e: React.KeyboardEvent) => {
    const k = e.key
    if (k === 'ArrowLeft' || k === 'ArrowRight') stepBy(k === 'ArrowLeft' ? -1 : 1)
    else if (k === 'Home') onPin(years[0])
    else if (k === 'End') onPin(years[last])
    else if (k === 'Escape' && pinned !== undefined) (e.stopPropagation(), onPin(undefined))
    else return
    e.preventDefault()
  }

  const gw = comparing ? Math.min(9, (step * 0.8) / bands.length) : 0

  const panel = read >= 0 && (
    <div
      role={hov >= 0 ? 'tooltip' : 'status'}
      className={cn(
        'z-20 rounded-[3px] border border-hairline bg-surface-raised px-3 py-2.5 text-sm',
        compact ? 'mt-4 w-full' : 'pointer-events-none absolute top-14 w-64 shadow-lg',
      )}
      style={compact ? undefined : years[read] >= 2016 ? { left: x(0) } : { left: cw - 270 }}
    >
      <p className="font-medium">{years[read]}</p>
      {comparing ? (
        <dl className="mt-1.5 grid grid-cols-[0.625rem_1fr_auto_auto] items-center gap-x-2 gap-y-0.5 text-xs">
          <span />
          <span />
          <span className="text-end text-ink-2">so far</span>
          <span className="text-end text-ink-2">in {years[read]}</span>
          {[...bands]
            .sort((a, c) => c.cum[read] - a.cum[read])
            .map((b) => (
              <div key={b.key} className="contents">
                <span className="size-2.5" style={{ background: b.fill }} />
                <dt className="truncate text-ink-2">{b.label}</dt>
                <dd className="m-0 text-end font-mono">{b.cum[read]}</dd>
                <dd className="m-0 w-10 text-end font-mono text-ink-2">{b.per[read]}</dd>
              </div>
            ))}
        </dl>
      ) : (
        <>
          <dl className="mt-1.5 grid grid-cols-[1fr_auto] gap-x-4 gap-y-0.5 text-xs">
            <dt className="text-ink-2">Founded so far</dt>
            <dd className="m-0 text-end font-mono">{f.cum[read]}</dd>
            <dt className="text-ink-2">Labelled so far</dt>
            <dd className="m-0 text-end font-mono">{l.cum[read]}</dd>
            <dt className="text-ink-2">Founded in {years[read]}</dt>
            <dd className="m-0 text-end font-mono">{f.per[read]}</dd>
            <dt className="text-ink-2">Labelled in {years[read]}</dt>
            <dd className="m-0 text-end font-mono">{l.per[read]}</dd>
          </dl>
          {!active && (
            <dl className="mt-2 grid grid-cols-[0.625rem_1fr_auto] items-center gap-x-2 gap-y-0.5 border-t border-hairline pt-2 text-xs">
              {[...bands].reverse().map((b) => (
                <div key={b.key} className="contents">
                  <span className="size-2.5" style={{ background: b.fill }} />
                  <dt className="truncate text-ink-2">{b.label}</dt>
                  <dd className="m-0 text-end font-mono">{b.cum[read]}</dd>
                </div>
              ))}
            </dl>
          )}
        </>
      )}
    </div>
  )

  return (
    <div ref={box} className="relative mt-6">
      <div className={cn('flex items-center justify-between gap-4', compact ? 'mb-3' : 'mb-1')} onKeyDown={onKey}>
        <p className="text-xs text-ink-2">{comparing ? 'Founded so far, by sector' : ''}</p>
        <Stepper years={years} pinned={pinned} onPin={onPin} compact={compact} />
      </div>
      <svg
        width={width}
        height={H}
        tabIndex={0}
        aria-label="Growth by year. Left and right arrows step the year; Escape clears it."
        onKeyDown={onKey}
        className="block overflow-visible outline-none focus-visible:ring-2 focus-visible:ring-glaze"
        onPointerLeave={() => setHoverY(null)}
      >
        {Array.from({ length: Math.floor(top / tick) }, (_, k) => (k + 1) * tick).map((v) => (
          <g key={v}>
            <line x1={0} x2={cw} y1={ya(v) + 0.5} y2={ya(v) + 0.5} className="stroke-hairline" strokeDasharray="2 4" />
            <text x={0} y={ya(v) - 5} className="fill-ink-2 font-mono text-[11px]">
              {v}
            </text>
          </g>
        ))}

        {paths.map(({ b, d, edge }) =>
          active ? (
            <g key={b.key}>
              <path d={d} style={{ fill: b.fill, fillOpacity: 0.24 }} />
              <path d={edge} fill="none" style={{ stroke: b.fill }} strokeWidth={2} strokeLinejoin="round" />
            </g>
          ) : (
            <path
              key={b.key}
              d={d}
              style={{ fill: b.fill, opacity: dim(b.key) }}
              className="stroke-canvas transition-opacity duration-150 motion-reduce:transition-none"
              strokeWidth={1}
              strokeLinejoin="round"
            />
          ),
        )}
        {comparing &&
          bands.map((b) => (
            <path key={b.key} d={`M${pts(b.cum)}`} fill="none" style={{ stroke: b.fill, opacity: dim(b.key) }} strokeWidth={2} strokeLinejoin="round" className="transition-opacity duration-150" />
          ))}
        {comparing &&
          !compact &&
          ends.map(({ b, y }) => (
            <text key={b.key} x={x(last) + 10} y={y + 4} className="font-sans text-[12.5px]" style={{ fill: b.fill, opacity: dim(b.key) }}>
              {b.label}
            </text>
          ))}
        <line x1={0} x2={cw} y1={AH + 0.5} y2={AH + 0.5} className="stroke-control" />

        {/* The label begins */}
        <line x1={startX} x2={startX} y1={6} y2={H - 26} className="stroke-control" strokeDasharray="3 3" />
        <text x={startX - 8} y={12} textAnchor="end" className="fill-ink-2 font-sans text-[12px]">
          {startX > 260 ? `The Startup Label begins, ${MONTHS[firstLabel.month - 1]} ${firstLabel.year}` : `Label begins, ${firstLabel.year}`}
        </text>

        {!comparing && (
          <>
            <path d={`M${linePts.map(([a, b]) => `${a},${b}`).join(' L')}`} fill="none" className="stroke-ink" strokeWidth={2.5} strokeLinejoin="round" />
            {linePts.slice(1).map(([a, b]) => (
              <circle key={a} cx={a} cy={b} r={3.5} className="fill-ink stroke-canvas" strokeWidth={1.5} />
            ))}
            {!compact && pk >= 0 && (
              <>
                <text x={x(pk) - 6} y={ya(f.cum[pk]) - 10} textAnchor="end" className="fill-ink-2 font-sans text-[12.5px]">
                  Founded so far
                </text>
                <text x={active ? x(pk) + 10 : x(p22) + 16} y={active ? ya(l.cum[pk]) + 20 : ya(at(l.cum, x(p22) + 16)) + 24} className="fill-ink font-sans text-[12.5px] font-medium">
                  Labelled so far
                </text>
              </>
            )}
            <text x={x(last)} y={ya(Math.max(f.cum[last], l.cum[last])) - 12} textAnchor="middle" className="fill-ink font-display text-[22px]">
              {cur.length}
            </text>
          </>
        )}

        {/* Band names, inside the bands at their 2025 edge */}
        {!compact &&
          !active &&
          !comparing &&
          paths.map(({ b, lo, hi }) => {
            const right = x(last) - 12
            let size = 12.5
            let cx = right - b.label.length * 3.4
            let tall = ya(at(lo, cx)) - ya(at(hi, cx))
            if (tall < 18) {
              size = 11.5
              cx = right - b.label.length * 3.1
              tall = ya(at(lo, cx)) - ya(at(hi, cx))
            }
            if (tall < 14) return null
            const mid = (ya(at(lo, cx)) + ya(at(hi, cx))) / 2
            return (
              <text
                key={b.key}
                x={right}
                y={mid + size * 0.35}
                textAnchor="end"
                className={cn('pointer-events-none font-sans', b.key === OTHER ? 'fill-ink' : 'fill-canvas')}
                style={{ fontSize: size, opacity: dim(b.key) }}
              >
                {b.label}
              </text>
            )
          })}

        {/* New each year */}
        <text x={0} y={barTop} className="fill-ink-2 font-sans text-[12px]">
          {comparing ? (
            'Founded each year'
          ) : (
            <>
              New each year:
              <tspan dx={8}>founded</tspan>
              <tspan dx={6} className="fill-tile-4">
                ■
              </tspan>
              <tspan dx={10}>labelled</tspan>
              <tspan dx={6} className="fill-ink">
                ■
              </tspan>
            </>
          )}
        </text>
        {years.map((yr, i) => {
          const showVal = !compact
          return (
            <g key={yr}>
              {comparing
                ? bands.map((b, k) =>
                    b.per[i] > 0 ? (
                      <rect
                        key={b.key}
                        x={x(i) - (gw * bands.length) / 2 + k * gw}
                        y={yb(b.per[i])}
                        width={Math.max(1, gw - 1)}
                        height={barTop + BH - yb(b.per[i])}
                        style={{ fill: b.fill, opacity: dim(b.key) }}
                      />
                    ) : null,
                  )
                : [
                    f.per[i] > 0 && (
                      <g key="f">
                        <rect x={x(i) - bw - gap} y={yb(f.per[i])} width={bw} height={barTop + BH - yb(f.per[i])} className="fill-tile-4" />
                        {showVal && (
                          <text x={x(i) - bw / 2 - gap} y={yb(f.per[i]) - 4} textAnchor="middle" className="fill-ink-2 font-mono text-[10.5px]">
                            {f.per[i]}
                          </text>
                        )}
                      </g>
                    ),
                    l.per[i] > 0 && (
                      <g key="l">
                        <rect x={x(i) + gap} y={yb(l.per[i])} width={bw} height={barTop + BH - yb(l.per[i])} className="fill-ink" />
                        {showVal && (
                          <text x={x(i) + bw / 2 + gap} y={yb(l.per[i]) - 4} textAnchor="middle" className="fill-ink font-mono text-[10.5px]">
                            {l.per[i]}
                          </text>
                        )}
                      </g>
                    ),
                  ]}
              <text
                x={x(i)}
                y={barTop + BH + 18}
                textAnchor="middle"
                className={cn('font-sans', compact ? 'text-[10px]' : 'text-[12px]', pin === i ? 'fill-ink font-semibold' : hov === i ? 'fill-ink' : 'fill-ink-2')}
              >
                {compact ? `’${String(yr).slice(2)}` : yr}
              </text>
            </g>
          )
        })}
        <line x1={0} x2={cw} y1={barTop + BH + 0.5} y2={barTop + BH + 0.5} className="stroke-hairline" />

        {pin >= 0 && <line x1={x(pin)} x2={x(pin)} y1={20} y2={barTop + BH} className="stroke-ink" strokeOpacity={0.85} />}
        {hov >= 0 && hov !== pin && <line x1={x(hov)} x2={x(hov)} y1={20} y2={barTop + BH} className="stroke-ink" strokeOpacity={0.35} />}
        {years.map((yr, i) => (
          <rect key={yr} x={i * step} y={0} width={step} height={H} fill="transparent" className="cursor-pointer" onPointerEnter={() => setHoverY(yr)} onClick={() => onPin(pinned === yr ? undefined : yr)} />
        ))}
      </svg>

      {compact && (
        <ul className="mt-3 grid gap-y-1.5 text-xs">
          {(comparing ? bands : [...bands].reverse()).map((b) => (
            <li key={b.key} className="flex items-center gap-2">
              <span className="size-2.5 shrink-0" style={{ background: b.fill }} />
              <span className="flex-1">{b.label}</span>
              <span className="font-mono text-ink-2">{b.total}</span>
            </li>
          ))}
        </ul>
      )}

      {panel}
    </div>
  )
}

const csvCell = (v: string | number | null) => {
  const s = v === null ? '' : String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
function download(name: string, table: (string | number | null)[][]) {
  const blob = new Blob([table.map((r) => r.map(csvCell).join(',')).join('\n')], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

/** A square segmented control: one radio group, state lives in the URL. */
function Segmented<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-ink-2">{label}</span>
      <div role="radiogroup" aria-label={label} className="flex rounded-[3px] border border-hairline p-0.5">
        {options.map(([v, text]) => (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={value === v}
            onClick={() => onChange(v)}
            className={cn('h-7 rounded-[2px] px-2.5 text-[12.5px]', value === v ? 'bg-surface-raised text-ink' : 'text-ink-2 hover:text-ink')}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  )
}

type SortKey = 'name' | 'total' | number

/** The numbers behind the chart: sector by year, in the basis, mode and unit the reader picks. Every count opens its startups. */
function Numbers({
  rows,
  sectors,
  selected,
  search,
  pinned,
  onHover,
}: {
  rows: LandscapeRow[]
  sectors: string[]
  selected: string[]
  search: { basis?: Basis; show?: Show; as?: As }
  pinned?: number
  onHover: (s: string | undefined) => void
}) {
  const navigate = useNavigate({ from: '/landscape' })
  const basis = search.basis ?? 'founded'
  const show = search.show ?? 'each'
  const unit = search.as ?? 'count'
  const [sortState, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'total', dir: 'desc' })

  const keyOf = (r: LandscapeRow) => (basis === 'founded' ? r.founded : r.year)
  const span = yearSpan(rows)
  const years = basis === 'founded' ? span.filter((y) => rows.some((r) => r.founded !== null && r.founded <= y)) : span.filter((y) => y >= Math.min(...rows.map((r) => r.year)))
  const line = (list: LandscapeRow[]) => {
    const per = years.map((y) => list.filter((r) => keyOf(r) === y).length)
    let run = 0
    const cum = per.map((n) => (run += n))
    return { per, vals: show === 'cum' ? cum : per, total: list.length }
  }
  const all = line(rows)
  // So far: the total is the last year, so the column goes and its sort moves to that year.
  const sort = show === 'cum' && sortState.key === 'total' ? { ...sortState, key: years[years.length - 1] as SortKey } : sortState
  const table = sectors.map((s) => ({ name: s, ...line(rows.filter((r) => r.sector === s)) }))
  const cellOf = (v: number, i: number) => (unit === 'share' ? (all.vals[i] ? (v / all.vals[i]) * 100 : 0) : v)
  const totalOf = (t: number) => (unit === 'share' ? (t / all.total) * 100 : t)
  const fmt = (v: number) => (unit === 'share' ? `${v.toFixed(1)}%` : String(v))
  const sorted = [...table].sort((a, b) => {
    const d = sort.dir === 'asc' ? 1 : -1
    if (sort.key === 'name') return d * a.name.localeCompare(b.name)
    if (sort.key === 'total') return d * (a.total - b.total) || a.name.localeCompare(b.name)
    const i = years.indexOf(sort.key)
    return d * (a.vals[i] - b.vals[i]) || a.name.localeCompare(b.name)
  })
  const sortBy = (key: SortKey) => setSort(() => ({ key, dir: sort.key === key ? (sort.dir === 'desc' ? 'asc' : 'desc') : key === 'name' ? 'asc' : 'desc' }))
  const ariaSort = (key: SortKey) => (sort.key === key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none')
  const set = (patch: Partial<{ basis: Basis; show: Show; as: As }>) =>
    navigate({
      search: (p) => {
        const n = { ...p, ...patch }
        return { ...n, basis: n.basis === 'label' ? 'label' : undefined, show: n.show === 'cum' ? 'cum' : undefined, as: n.as === 'share' ? 'share' : undefined }
      },
      resetScroll: false,
      replace: true,
    })

  const head = (key: SortKey, text: string, cls?: string) => (
    <th key={String(key)} scope="col" aria-sort={ariaSort(key)} className={cn('h-8 border-b border-hairline px-2 font-normal', cls, typeof key === 'number' && key === pinned && 'bg-surface')}>
      <button type="button" onClick={() => sortBy(key)} className={cn('inline-flex items-center gap-1 text-xs', sort.key === key ? 'text-ink' : 'text-ink-2 hover:text-ink')}>
        {text}
        {sort.key === key && <span aria-hidden>{sort.dir === 'asc' ? '↑' : '↓'}</span>}
      </button>
    </th>
  )
  const label = `${basis === 'founded' ? 'Year founded' : 'Year labelled'}, ${show === 'each' ? 'each year' : 'so far'}, ${unit === 'count' ? 'count' : 'share of the year'}`

  const exportShown = () =>
    download(`athar-landscape-${basis}-${show}-${unit}.csv`, [
      ['Sector', ...years, ...(show === 'each' ? ['Total'] : [])],
      [unit === 'share' ? 'All sectors (count)' : 'All sectors', ...all.vals, ...(show === 'each' ? [all.total] : [])],
      ...sorted.map((r) => [
        r.name,
        ...r.vals.map((v, i) => (unit === 'share' ? Number(cellOf(v, i).toFixed(1)) : v)),
        ...(show === 'each' ? [unit === 'share' ? Number(totalOf(r.total).toFixed(1)) : r.total] : []),
      ]),
    ])
  const exportAll = () =>
    download('athar-startups.csv', [
      ['name', 'sector', 'founded', 'label_month', 'founders', 'website'],
      ...rows.map((r) => [r.name, r.sector, r.founded, `${r.year}-${String(r.month).padStart(2, '0')}`, r.founders, r.website ? 'yes' : 'no']),
    ])

  const row = (name: string, vals: number[], total: number, opts: { all?: boolean; sector?: string }) => {
    const shown = opts.all ? vals : vals.map((v, i) => cellOf(v, i))
    const peak = Math.max(...shown)
    const on = opts.sector !== undefined && selected.includes(opts.sector)
    return (
      <tr
        key={name}
        className={cn('h-8 border-b border-hairline', on && 'bg-surface', opts.all && 'font-medium')}
        onPointerEnter={() => opts.sector && onHover(opts.sector)}
        onPointerLeave={() => opts.sector && onHover(undefined)}
      >
        <th scope="row" className={cn('sticky left-0 z-10 max-w-[16rem] truncate px-2 text-start text-[13px]', on ? 'bg-surface' : 'bg-canvas', opts.all ? 'font-medium text-ink' : 'font-normal text-ink')}>
          {opts.sector ? (
            <span className="flex items-center gap-2">
              <SectorSwatch sector={opts.sector} size={12} />
              <span className="truncate">{name}</span>
            </span>
          ) : (
            name
          )}
        </th>
        {shown.map((v, i) => {
          const raw = (show === 'cum' ? vals : vals)[i]
          const y = years[i]
          const isPeak = show === 'each' && !opts.all && v === peak && v > 0
          const text = raw === 0 ? '·' : opts.all ? String(v) : fmt(v)
          const cls = cn('px-2 text-end font-mono text-[12.5px] tabular-nums', y === pinned && 'bg-surface', raw === 0 ? 'text-ink-2' : opts.all ? (unit === 'share' ? 'text-ink-2' : 'font-medium text-ink') : isPeak ? 'font-medium text-ink' : 'text-ink-2')
          return (
            <td key={y} className={cls}>
              {show === 'each' && raw > 0 ? (
                <Link
                  to="/search"
                  search={basis === 'label' ? { sector: opts.sector, from: y, to: y } : { sector: opts.sector, founded: y }}
                  className="text-inherit no-underline hover:text-glaze hover:underline focus-visible:text-glaze focus-visible:underline"
                >
                  {text}
                </Link>
              ) : (
                text
              )}
            </td>
          )
        })}
        {show === 'each' && (
          <td className={cn('border-s border-hairline px-2 text-end font-mono text-[12.5px] tabular-nums', opts.all && unit === 'share' ? 'text-ink-2' : 'text-ink')}>{opts.all ? total : fmt(totalOf(total))}</td>
        )}
      </tr>
    )
  }

  return (
    <section aria-labelledby="numbers-h" className="mt-12">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 border-b border-hairline pb-3">
        <div>
          <h2 id="numbers-h" className="text-[1.75rem] leading-9">
            The numbers
          </h2>
          <p className="mt-1 flex flex-wrap gap-x-5 text-sm">
            <button type="button" onClick={exportShown} className="text-glaze hover:underline">
              Download CSV
            </button>
            <button type="button" onClick={exportAll} className="text-glaze hover:underline">
              All {rows.length} rows (CSV)
            </button>
          </p>
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          <Segmented label="Year of" value={basis} options={[['founded', 'Founding'], ['label', 'Label']]} onChange={(v) => set({ basis: v })} />
          <Segmented label="Show" value={show} options={[['each', 'Each year'], ['cum', 'So far']]} onChange={(v) => set({ show: v })} />
          <Segmented label="As" value={unit} options={[['count', 'Count'], ['share', 'Share']]} onChange={(v) => set({ as: v })} />
        </div>
      </div>
      <Scroller axis="both" label={label}>
        <table className="w-full min-w-[56rem] border-collapse text-sm">
          <caption className="sr-only">{label}</caption>
          <thead>
            <tr>
              <th scope="col" aria-sort={ariaSort('name')} className="sticky left-0 z-10 h-8 border-b border-hairline bg-canvas px-2 text-start font-normal">
                <button type="button" onClick={() => sortBy('name')} className={cn('text-xs', sort.key === 'name' ? 'text-ink' : 'text-ink-2 hover:text-ink')}>
                  Sector {sort.key === 'name' && <span aria-hidden>{sort.dir === 'asc' ? '↑' : '↓'}</span>}
                </button>
              </th>
              {years.map((y) => head(y, String(y), 'text-end'))}
              {show === 'each' && head('total', 'Total', 'border-s border-hairline text-end')}
            </tr>
          </thead>
          <tbody>
            {row(unit === 'share' ? 'All sectors (count)' : 'All sectors', all.vals, all.total, { all: true })}
            {sorted.map((r) => row(r.name, r.vals, r.total, { sector: r.name }))}
          </tbody>
        </table>
      </Scroller>
      <p className="mt-2 text-xs text-ink-2">
        {unit === 'share' ? 'Share is the sector’s part of that year’s total. ' : ''}{show === 'each' ? 'Bold marks each sector’s highest year. Every count opens its startups in the Archive.' : 'Running totals to the end of each year.'}
      </p>
    </section>
  )
}

function Sentence({ cur, active, selected, colour }: { cur: LandscapeRow[]; active?: string; selected: string[]; colour: (s: string) => string }) {
  if (selected.length > 1) {
    const size = selected.map((n) => [n, cur.filter((r) => r.sector === n).length] as const).sort((a, b) => b[1] - a[1])
    const name = (n: string) => <span style={{ color: colour(n) }}>{n}</span>
    const big = size[0]
    const small = size[size.length - 1]
    return (
      <p className="mt-4 min-h-16 max-w-[60rem] font-display text-[1.375rem] leading-8">
        Comparing{' '}
        {selected.map((n, i) => (
          <span key={n}>
            {i > 0 && (i === selected.length - 1 ? ' and ' : ', ')}
            {name(n)}
          </span>
        ))}
        . {name(big[0])} is the largest, with {big[1]}; {name(small[0])} the smallest, with {small[1]}.
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
  const subject = active ? <span style={{ color: sectorStyle(active).glaze.fill }}>{active}</span> : 'The registry'
  return (
    <p className="mt-4 min-h-16 max-w-[60rem] font-display text-[1.375rem] leading-8">
      {subject} grew from {plural(firstN, 'startup', 'startups')} founded in {first} to {cur.length} today. {before === 0 ? 'None was' : `${before} ${before === 1 ? 'was' : 'were'}`} founded
      before the label existed. Founding peaked in {peak}, with {peakN}.
    </p>
  )
}

// The one place the page names startups: the newest labels in the current selection.
function Latest({ cur }: { cur: LandscapeRow[] }) {
  const six = [...cur].sort((a, b) => b.year - a.year || b.month - a.month || a.name.localeCompare(b.name)).slice(0, 6)
  return (
    <section aria-labelledby="latest-h" className="mt-7 border-t border-hairline pt-4">
      <h2 id="latest-h" className="font-sans text-sm font-medium text-ink-2">
        Latest to receive the label
      </h2>
      <ul className="mt-3 grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-3 2xl:grid-cols-6">
        {six.map((r) => (
          <li key={r.id} className="grid min-w-0 grid-cols-[1.25rem_minmax(0,1fr)] gap-x-2.5">
            <TileMark id={r.id} sector={r.sector} size={20} className="mt-0.5" />
            <Link to="/startups/$id" params={{ id: r.id }} className="truncate text-sm text-ink no-underline hover:underline">
              {r.name}
            </Link>
            <span className="col-start-2 font-mono text-xs text-ink-2">
              {MONTHS[r.month - 1].slice(0, 3)} {r.year}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
