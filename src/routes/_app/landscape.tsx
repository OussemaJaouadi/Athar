import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'

import { SectorSwatch, TileMark, sectorStyle } from '@/components/athar/tile-mark'
import { cn } from '@/lib/utils'
import { getLandscapeRows, type LandscapeRow } from '#/server/api/app'

type Search = { sector?: string }

export const Route = createFileRoute('/_app/landscape')({
  validateSearch: (s: Record<string, unknown>): Search => ({ sector: typeof s.sector === 'string' && s.sector ? s.sector : undefined }),
  loader: () => getLandscapeRows(),
  component: LandscapePage,
})

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const OTHER = 'other'
const OTHER_FILL = 'color-mix(in oklab, var(--ink-2) 48%, var(--canvas))'
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

// Landscape: how the scene grew, from the first founding to today, and what it is made of.
function LandscapePage() {
  const rows = Route.useLoaderData()
  const { sector } = Route.useSearch()
  const navigate = useNavigate({ from: '/landscape' })
  const [preview, setPreview] = useState<string | undefined>()
  const hoverTimer = useRef<number | undefined>(undefined)
  const active = preview ?? sector

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

  const cur = active ? rows.filter((r) => r.sector === active) : rows

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && sector) navigate({ search: {}, resetScroll: false })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [sector, navigate])

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
    navigate({ search: name === sector ? {} : { sector: name }, resetScroll: false })
  }
  const hover = (name: string | undefined) => {
    window.clearTimeout(hoverTimer.current)
    hoverTimer.current = window.setTimeout(() => setPreview(name), name ? 80 : 0)
  }

  return (
    <main className="grid flex-1 grid-cols-[minmax(0,1fr)] gap-x-8 gap-y-10 px-4 pt-10 pb-14 sm:px-8 xl:grid-cols-[minmax(0,1fr)_372px] 2xl:gap-x-14">
      <section className="min-w-0">
        <h1 className="text-[2.75rem] leading-[3rem]">Landscape</h1>
        <Sentence cur={cur} active={active} />
        <Growth rows={rows} sectors={sectors.map((s) => s.name)} active={active} />
        <Facts cur={cur} />
        <Latest cur={cur} />
      </section>

      <aside aria-label="Sectors" className="xl:pt-3">
        <div className="grid grid-cols-[minmax(0,1fr)_3rem_5.5rem] border-b border-hairline px-1.5 pb-2 text-xs whitespace-nowrap text-ink-2">
          <span>Sector</span>
          <span className="text-end">All</span>
          <span className="text-end">Before 2019</span>
        </div>
        <ul className="sm:columns-2 sm:gap-x-8 xl:columns-1" onPointerLeave={() => hover(undefined)}>
          {sectors.map((s) => (
            <li key={s.name} className="break-inside-avoid">
              <button
                type="button"
                aria-pressed={sector === s.name}
                onClick={() => pick(s.name)}
                onPointerEnter={() => hover(s.name)}
                className={cn(
                  'grid h-[27px] w-full grid-cols-[1.375rem_minmax(0,1fr)_3rem_5.5rem] items-center border-b border-hairline px-1.5 text-start text-[13.5px] transition-opacity duration-150 hover:bg-surface/60 motion-reduce:transition-none',
                  active && (active === s.name ? 'bg-surface' : 'opacity-40'),
                )}
              >
                <SectorSwatch sector={s.name} size={15} />
                <span className="truncate">{s.name}</span>
                <span className="text-end tabular-nums">{s.total}</span>
                <span className="text-end text-ink-2 tabular-nums">{s.before}</span>
              </button>
            </li>
          ))}
        </ul>
        <p className="mt-3.5 px-1.5 text-xs leading-5 text-ink-2">
          Founding years come from the registry, so only startups that later received the label are counted. Recent years are incomplete.
        </p>
        {sector && (
          <p className="mt-5 flex flex-col gap-2 px-1.5 text-sm">
            <Link to="/search" search={{ sector }}>
              See the {rows.filter((r) => r.sector === sector).length} in the Archive
            </Link>
            <Link to="/" search={{ draft: `${sector}: ` }}>
              Check an idea in {sector}
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

type Band = { key: string; label: string; fill: string; total: number; cum: number[] }

/** Founded so far as stacked bands, labelled so far as a line, and new each year as paired bars, on one year axis. */
function Growth({ rows, sectors, active }: { rows: LandscapeRow[]; sectors: string[]; active?: string }) {
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

  const cur = active ? rows.filter((r) => r.sector === active) : rows
  const founded = rows.map((r) => r.founded).filter((y): y is number => y !== null)
  const y0 = Math.min(...founded)
  const y1 = Math.max(...founded, ...rows.map((r) => r.year))
  const years = Array.from({ length: y1 - y0 + 1 }, (_, i) => y0 + i)
  const firstLabel = rows.reduce((a, r) => (r.year * 12 + r.month < a.year * 12 + a.month ? r : a), rows[0])

  const cumBy = (list: LandscapeRow[], key: (r: LandscapeRow) => number | null) => {
    const per = years.map((y) => list.filter((r) => key(r) === y).length)
    let run = 0
    return { per, cum: per.map((n) => (run += n)) }
  }
  const top5 = sectors.slice(0, 5)
  const bands: Band[] = active
    ? [{ key: active, label: active, fill: sectorStyle(active).glaze.fill, total: cur.length, cum: cumBy(cur, (r) => r.founded).cum }]
    : [
        ...top5.map((s) => {
          const list = rows.filter((r) => r.sector === s)
          return { key: s, label: s, fill: sectorStyle(s).glaze.fill, total: list.length, cum: cumBy(list, (r) => r.founded).cum }
        }),
        (() => {
          const list = rows.filter((r) => !top5.includes(r.sector))
          return { key: OTHER, label: `${sectors.length - 5} other sectors`, fill: OTHER_FILL, total: list.length, cum: cumBy(list, (r) => r.founded).cum }
        })(),
      ]
  const f = cumBy(cur, (r) => r.founded)
  const l = cumBy(cur, (r) => r.year)

  const compact = width < 720
  const GUT = compact ? 8 : 270
  const AH = compact ? 240 : 330
  const BH = compact ? 80 : 110
  const cw = Math.max(200, width - GUT)
  const step = cw / years.length
  const x = (i: number) => step * (i + 0.5)
  const yMax = Math.max(1, f.cum[f.cum.length - 1], l.cum[l.cum.length - 1])
  const tick = niceStep(yMax)
  const top = yMax * 1.06
  const ya = (v: number) => 20 + (AH - 20) * (1 - v / top)
  const barTop = AH + 44
  const bMax = Math.max(1, ...f.per, ...l.per)
  const yb = (v: number) => barTop + 18 + (BH - 18) * (1 - v / bMax)
  const H = barTop + BH + 26

  // Stacked band paths.
  let base = years.map(() => 0)
  const paths = bands.map((b) => {
    const lo = base
    const hi = base.map((v, i) => v + b.cum[i])
    base = hi
    const up = hi.map((v, i) => `${x(i)},${ya(v)}`).join(' L')
    const down = lo.map((v, i) => `${x(i)},${ya(v)}`).reverse().join(' L')
    return { b, d: `M${up} L${down} Z`, edge: `M${up}`, mid: (ya(lo[lo.length - 1]) + ya(hi[hi.length - 1])) / 2 }
  })
  // Direct labels: relax so they never collide.
  const labels = [...paths].sort((a, b) => a.mid - b.mid).map((p) => ({ p, y: p.mid }))
  for (let i = 1; i < labels.length; i++) labels[i].y = Math.max(labels[i].y, labels[i - 1].y + 20)
  for (let i = labels.length - 2; i >= 0; i--) labels[i].y = Math.min(labels[i].y, labels[i + 1].y - 20)

  const li = years.indexOf(firstLabel.year)
  const startX = x(li - 1) + ((firstLabel.month - 1) / 12) * step
  const lineFrom = Math.max(0, li - 1)
  const linePts = l.cum.map((v, i) => [x(i), ya(v)] as const).slice(lineFrom)
  const bw = Math.min(16, step * 0.28)
  const gap = 3
  const last = years.length - 1
  const hi = hoverY === null ? null : years.indexOf(hoverY)

  return (
    <div ref={box} className="relative mt-6">
      <svg width={width} height={H} className="block overflow-visible" onPointerLeave={() => setHoverY(null)}>
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
              <path d={d} style={{ fill: b.fill, fillOpacity: 0.35 }} />
              <path d={edge} fill="none" style={{ stroke: b.fill }} strokeWidth={2} strokeLinejoin="round" />
            </g>
          ) : (
            <path key={b.key} d={d} style={{ fill: b.fill }} className="stroke-canvas" strokeWidth={1} strokeLinejoin="round" />
          ),
        )}
        <line x1={0} x2={cw} y1={AH + 0.5} y2={AH + 0.5} className="stroke-control" />

        {/* The label begins */}
        <line x1={startX} x2={startX} y1={6} y2={H - 26} className="stroke-control" strokeDasharray="3 3" />
        <text x={startX < 300 ? startX + 8 : startX - 8} y={12} textAnchor={startX < 300 ? 'start' : 'end'} className="fill-ink-2 font-sans text-[12px]">
          The Startup Label begins, {MONTHS[firstLabel.month - 1]} {firstLabel.year}
        </text>

        {/* Labelled so far */}
        <path d={`M${linePts.map(([a, b]) => `${a},${b}`).join(' L')}`} fill="none" className="stroke-ink" strokeWidth={2.5} strokeLinejoin="round" />
        {linePts.slice(1).map(([a, b]) => (
          <circle key={a} cx={a} cy={b} r={3.5} className="fill-ink stroke-canvas" strokeWidth={1.5} />
        ))}
        {!compact && (
          <>
            <text x={x(last) - 10} y={ya(l.cum[last]) - 12} textAnchor="end" className="fill-ink font-sans text-[12.5px] font-medium">
              Labelled so far
            </text>
            <text x={x(Math.max(0, li - 3))} y={ya(f.cum[Math.max(0, li - 3)]) - 14} textAnchor="middle" className="fill-ink-2 font-sans text-[12.5px]">
              Founded so far
            </text>
          </>
        )}

        {!compact &&
          labels.map(({ p, y }) => (
            <g key={p.b.key} transform={`translate(${cw + 14} ${y})`}>
              <rect x={0} y={-5} width={10} height={10} style={{ fill: p.b.fill }} />
              <text x={18} y={4} className="fill-ink font-sans text-[13px]">
                {p.b.label}
                <tspan dx={8} className="fill-ink-2 font-mono text-[11.5px]">
                  {p.b.total}
                </tspan>
              </text>
            </g>
          ))}

        {/* New each year */}
        <text x={0} y={barTop} className="fill-ink-2 font-sans text-[12px]">
          New each year:
          <tspan dx={8}>founded</tspan>
          <tspan dx={6} className="fill-tile-4">
            ■
          </tspan>
          <tspan dx={10}>labelled</tspan>
          <tspan dx={6} className="fill-ink">
            ■
          </tspan>
        </text>
        {years.map((yr, i) => {
          const fv = f.per[i]
          const lv = l.per[i]
          const showVal = !compact || hi === i
          return (
            <g key={yr}>
              {fv > 0 && (
                <>
                  <rect x={x(i) - bw - gap} y={yb(fv)} width={bw} height={barTop + BH - yb(fv)} className="fill-tile-4" />
                  {showVal && (
                    <text x={x(i) - bw / 2 - gap} y={yb(fv) - 4} textAnchor="middle" className="fill-ink-2 font-mono text-[10.5px]">
                      {fv}
                    </text>
                  )}
                </>
              )}
              {lv > 0 && (
                <>
                  <rect x={x(i) + gap} y={yb(lv)} width={bw} height={barTop + BH - yb(lv)} className="fill-ink" />
                  {showVal && (
                    <text x={x(i) + bw / 2 + gap} y={yb(lv) - 4} textAnchor="middle" className="fill-ink font-mono text-[10.5px]">
                      {lv}
                    </text>
                  )}
                </>
              )}
              <text x={x(i)} y={barTop + BH + 18} textAnchor="middle" className={cn('font-sans', compact ? 'text-[10px]' : 'text-[12px]', hi === i ? 'fill-ink' : 'fill-ink-2')}>
                {compact ? `’${String(yr).slice(2)}` : yr}
              </text>
            </g>
          )
        })}
        <line x1={0} x2={cw} y1={barTop + BH + 0.5} y2={barTop + BH + 0.5} className="stroke-hairline" />

        {hi !== null && hi >= 0 && <line x1={x(hi)} x2={x(hi)} y1={20} y2={barTop + BH} className="stroke-ink" strokeOpacity={0.5} />}
        {years.map((yr, i) => (
          <rect key={yr} x={i * step} y={0} width={step} height={H} fill="transparent" onPointerEnter={() => setHoverY(yr)} />
        ))}
      </svg>

      {compact && (
        <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
          {paths.map(({ b }) => (
            <li key={b.key} className="flex items-center gap-2">
              <span className="size-2.5 shrink-0" style={{ background: b.fill }} />
              <span className="truncate">{b.label}</span>
              <span className="font-mono text-ink-2">{b.total}</span>
            </li>
          ))}
        </ul>
      )}

      {hi !== null && hi >= 0 && (
        <div
          role="tooltip"
          className="pointer-events-none absolute top-6 z-20 w-60 rounded-[3px] border border-hairline bg-surface-raised px-3 py-2.5 text-sm shadow-lg"
          style={{ left: Math.min(Math.max(x(hi) + 14, 0), width - 250) }}
        >
          <p className="font-medium">{years[hi]}</p>
          <dl className="mt-1.5 grid grid-cols-[1fr_auto] gap-x-4 gap-y-0.5 text-xs">
            <dt className="text-ink-2">Founded so far</dt>
            <dd className="m-0 text-end font-mono">{f.cum[hi]}</dd>
            <dt className="text-ink-2">Labelled so far</dt>
            <dd className="m-0 text-end font-mono">{l.cum[hi]}</dd>
            <dt className="text-ink-2">Founded that year</dt>
            <dd className="m-0 text-end font-mono">{f.per[hi]}</dd>
            <dt className="text-ink-2">Labelled that year</dt>
            <dd className="m-0 text-end font-mono">{l.per[hi]}</dd>
          </dl>
          {!active && (
            <dl className="mt-2 grid grid-cols-[0.625rem_1fr_auto] items-center gap-x-2 gap-y-0.5 border-t border-hairline pt-2 text-xs">
              {[...bands].reverse().map((b) => (
                <div key={b.key} className="contents">
                  <span className="size-2.5" style={{ background: b.fill }} />
                  <dt className="truncate text-ink-2">{b.label}</dt>
                  <dd className="m-0 text-end font-mono">{b.cum[hi]}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      )}
    </div>
  )
}

function Sentence({ cur, active }: { cur: LandscapeRow[]; active?: string }) {
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

function Facts({ cur }: { cur: LandscapeRow[] }) {
  const two = cur.filter((r) => r.founders === 2).length
  const one = cur.filter((r) => r.founders === 1).length
  const facts = [
    [`${cur.filter((r) => r.founded === r.year).length} of ${cur.length}`, 'labelled in the year they were founded'],
    [`${two}`, `have two founders; ${one} have one`],
    [`${cur.filter((r) => r.website).length}`, 'list a website'],
  ]
  return (
    <dl className="mt-6 grid grid-cols-1 gap-x-10 gap-y-4 border-t border-hairline pt-5 sm:grid-cols-3">
      {facts.map(([n, say]) => (
        <div key={say} className="flex min-w-0 flex-col-reverse">
          <dt className="truncate text-[13.5px] text-ink-2">{say}</dt>
          <dd className="m-0 font-display text-2xl leading-8 tabular-nums">{n}</dd>
        </div>
      ))}
    </dl>
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
