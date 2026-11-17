import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'

import { Scroller } from '@/components/athar/scroller'
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
const RECENT = 2023
const RIGHT = 32 // the y labels sit after the last square
const QGAP = 3
const YGAP = 14

// The closest plain fraction, so the sentence reads like a person wrote it.
function share(n: number, of: number) {
  const r = n / Math.max(1, of)
  const words: [number, string][] = [
    [1 / 4, 'One in four'],
    [1 / 3, 'One in three'],
    [1 / 2, 'Half'],
    [2 / 3, 'Two in three'],
    [3 / 4, 'Three in four'],
    [9 / 10, 'Nine in ten'],
  ]
  return words.reduce((a, b) => (Math.abs(b[0] - r) < Math.abs(a[0] - r) ? b : a))[1]
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

// Landscape: one square per labelled startup, in the quarter it got the label, glazed by sector.
function LandscapePage() {
  const rows = Route.useLoaderData()
  const { sector } = Route.useSearch()
  const navigate = useNavigate({ from: '/landscape' })
  const [preview, setPreview] = useState<string | undefined>()
  const hoverTimer = useRef<number | undefined>(undefined)
  const active = preview ?? sector

  const model = useMemo(() => {
    const counts = new Map<string, number>()
    for (const r of rows) counts.set(r.sector, (counts.get(r.sector) ?? 0) + 1)
    const sectors = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([name, total]) => ({
      name,
      total,
      recent: rows.filter((r) => r.sector === name && r.year >= RECENT).length,
    }))
    const rank = new Map(sectors.map((s, i) => [s.name, i]))
    const qOf = (r: LandscapeRow) => r.year * 4 + Math.floor((r.month - 1) / 3)
    const first = rows.length ? Math.min(...rows.map(qOf)) : 0
    const last = rows.length ? Math.max(...rows.map(qOf)) : 0
    const quarters: LandscapeRow[][] = Array.from({ length: last - first + 1 }, () => [])
    for (const r of rows) quarters[qOf(r) - first].push(r)
    const firstYear = Math.floor(first / 4)
    const yearsB: LandscapeRow[][] = Array.from({ length: Math.floor(last / 4) - firstYear + 1 }, () => [])
    for (const r of rows) yearsB[r.year - firstYear].push(r)
    return { sectors, rank, first, firstYear, quarters, yearsB }
  }, [rows])

  // Pitch follows the plate's width.
  const plate = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(1200)
  useLayoutEffect(() => {
    const el = plate.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  // Under md the wall groups by year (six wide) so the whole arc fits a phone without scrolling.
  const compact = width < 720
  const C = compact ? 6 : 3
  const buckets = compact ? model.yearsB : model.quarters
  const nb = buckets.length
  const yearOfB = (i: number) => (compact ? model.firstYear + i : Math.floor((model.first + i) / 4))
  const years = model.yearsB.length
  const right = compact ? 0 : RIGHT
  const P = compact
    ? Math.max(4, Math.floor((width - (nb - 1) * 8) / (nb * C)))
    : Math.max(9, Math.min(14, Math.floor((width - RIGHT - (nb - 1) * QGAP - (years - 1) * YGAP) / (nb * C))))
  const S = P - 1
  const H = Math.ceil(Math.max(...buckets.map((b) => b.length)) / C) * P
  const qx = (i: number) => {
    if (compact) return i * (C * P + 8)
    const y = yearOfB(i) - yearOfB(0)
    return i * C * P + (i - y) * QGAP + y * YGAP
  }
  const W = qx(nb - 1) + C * P

  const squares = useMemo(
    () =>
      buckets.flatMap((q, i) =>
        [...q]
          .sort((a, b) => Number(b.sector === active) - Number(a.sector === active) || model.rank.get(a.sector)! - model.rank.get(b.sector)! || a.name.localeCompare(b.name))
          .map((r, j) => ({ r, i, col: j % C, row: Math.floor(j / C) })),
      ),
    [buckets, C, model.rank, active],
  )

  const cur = active ? rows.filter((r) => r.sector === active) : rows
  const byYear = new Map<number, number>()
  for (const r of cur) byYear.set(r.year, (byYear.get(r.year) ?? 0) + 1)
  const yearList = Array.from({ length: years }, (_, k) => model.firstYear + k)

  // Clear with Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && sector) navigate({ search: {}, resetScroll: false })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [sector, navigate])

  const [tip, setTip] = useState<{ r: LandscapeRow; x: number; y: number } | null>(null)

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
    <main className="grid flex-1 grid-cols-[minmax(0,1fr)] gap-x-8 gap-y-10 px-4 pt-10 2xl:gap-x-14 pb-14 sm:px-8 xl:grid-cols-[minmax(0,1fr)_372px]">
      <section className="min-w-0">
        <h1 className="text-[2.75rem] leading-[3rem]">Landscape</h1>
        <Sentence rows={rows} cur={cur} active={active} byYear={byYear} />
        <div ref={plate} className="relative mt-6">
          <Scroller axis="both" label="Startups by quarter labelled">
            <svg width={W + right} height={H + (compact ? 60 : 48)} className="block" onPointerLeave={() => setTip(null)}>
              {(compact ? [] : [15, 30, 45, 60])
                .filter((v) => (v / 3) * P <= H)
                .map((v) => {
                  const y = H - (v / 3) * P + 0.5
                  return (
                    <g key={v}>
                      <line x1={0} x2={W + 4} y1={y} y2={y} className="stroke-hairline" strokeDasharray="2 4" />
                      <text x={W + 8} y={y + 4} className="fill-ink-2 font-mono text-[11px]">
                        {v}
                      </text>
                    </g>
                  )
                })}
              <g
                className={compact ? 'pointer-events-none' : 'cursor-pointer'}
                onPointerMove={(e) => {
                  const k = (e.target as SVGElement).dataset.k
                  if (k === undefined) return // keep the last square across the 1px gaps
                  const box = plate.current!.getBoundingClientRect()
                  setTip({ r: squares[Number(k)].r, x: e.clientX - box.left, y: e.clientY - box.top })
                }}
                onClick={(e) => {
                  const k = (e.target as SVGElement).dataset.k
                  if (k !== undefined) navigate({ to: '/startups/$id', params: { id: squares[Number(k)].r.id } })
                }}
              >
                {squares.map(({ r, i, col, row }, k) => {
                  const x = qx(i) + col * P
                  const y = H - (row + 1) * P
                  return !active || r.sector === active ? (
                    <rect key={r.id} data-k={k} x={x} y={y} width={S} height={S} style={{ fill: sectorStyle(r.sector).glaze.fill }} />
                  ) : (
                    <rect key={r.id} data-k={k} x={x} y={y} width={S} height={S} className="fill-surface" />
                  )
                })}
              </g>
              {yearList.map((yr) => {
                const qs = buckets.map((_, i) => i).filter((i) => yearOfB(i) === yr)
                if (!qs.length) return null
                const a = qx(qs[0])
                const b = qx(qs[qs.length - 1]) + C * P - 1
                return (
                  <g key={yr}>
                    <line x1={a} x2={b} y1={H + 6.5} y2={H + 6.5} className="stroke-control" />
                    <text x={a} y={H + 26} className={cn('fill-ink font-sans font-medium', compact ? 'text-[12px]' : 'text-[13px]')}>
                      {yr}
                      <tspan {...(compact ? { x: a, dy: 16 } : { dx: 8 })} className={cn('font-mono font-normal', byYear.get(yr) ? 'fill-ink' : 'fill-ink-2')}>
                        {byYear.get(yr) ?? 0}
                      </tspan>
                    </text>
                  </g>
                )
              })}
            </svg>
          </Scroller>
          {tip && (
            <div
              role="tooltip"
              className="pointer-events-none absolute z-20 w-max max-w-72 -translate-x-1/2 -translate-y-full rounded-[3px] border border-hairline bg-surface-raised px-3 py-2 text-sm shadow-lg"
              style={{ left: Math.min(Math.max(tip.x, 150), width - 150), top: tip.y - 12 }}
            >
              <span className="flex items-center gap-2 font-medium">
                <TileMark id={tip.r.id} sector={tip.r.sector} size={16} />
                {tip.r.name}
              </span>
              <span className="mt-0.5 block text-xs text-ink-2">
                {tip.r.sector} · labelled {MONTHS[tip.r.month - 1]} {tip.r.year}
              </span>
            </div>
          )}
        </div>

        <div style={{ width: W, maxWidth: '100%' }}>
          <Facts cur={cur} />
          <Latest cur={cur} />
        </div>
      </section>

      <aside aria-label="Sectors" className="xl:pt-3">
        <div className="grid grid-cols-[minmax(0,1fr)_3rem_5rem] border-b border-hairline px-1.5 pb-2 text-xs text-ink-2">
          <span>Sector</span>
          <span className="text-end">All</span>
          <span className="text-end">Since {RECENT}</span>
        </div>
        <ul className="sm:columns-2 sm:gap-x-8 xl:columns-1" onPointerLeave={() => hover(undefined)}>
          {model.sectors.map((s) => (
            <li key={s.name} className="break-inside-avoid">
              <button
                type="button"
                aria-pressed={sector === s.name}
                onClick={() => pick(s.name)}
                onPointerEnter={() => hover(s.name)}
                className={cn(
                  'grid h-[27px] w-full grid-cols-[1.375rem_minmax(0,1fr)_3rem_5rem] items-center border-b border-hairline px-1.5 text-start text-[13.5px] transition-opacity duration-150 hover:bg-surface/60 motion-reduce:transition-none',
                  active && (active === s.name ? 'bg-surface' : 'opacity-40'),
                )}
              >
                <SectorSwatch sector={s.name} size={15} />
                <span className="truncate">{s.name}</span>
                <span className="text-end tabular-nums">{s.total}</span>
                <span className="text-end text-ink-2 tabular-nums">{s.recent}</span>
              </button>
            </li>
          ))}
        </ul>
        <p className="mt-3.5 px-1.5 text-xs leading-5 text-ink-2">One square is one startup, placed in the quarter it received the label. This is the registry, not the whole market.</p>
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

function Sentence({ rows, cur, active, byYear }: { rows: LandscapeRow[]; cur: LandscapeRow[]; active?: string; byYear: Map<number, number> }) {
  const cls = 'mt-4 min-h-16 max-w-[56rem] font-display text-[1.375rem] leading-8'
  if (!active) {
    const years = [...new Set(rows.map((r) => r.year))].sort()
    const early = years.slice(0, 3)
    const nEarly = rows.filter((r) => early.includes(r.year)).length
    const last = years[years.length - 1]
    return (
      <p className={cls}>
        {rows.length} startups carry the Startup Label. {share(nEarly, rows.length)} arrived in the first three years, {early[0]} to {early[early.length - 1]}. In {last} the registry added{' '}
        {byYear.get(last) ?? 0}.
      </p>
    )
  }
  const [busy, n] = [...byYear.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0] ?? [0, 0]
  const late = cur.filter((r) => r.year >= RECENT).length
  const newest = [...cur].sort((a, b) => b.year - a.year || b.month - a.month || a.name.localeCompare(b.name))[0]
  return (
    <p className={cls}>
      <span className="text-ochre-text">{active}</span>: {plural(cur.length, 'startup', 'startups')}. The busiest year was {busy}, with {n}.{' '}
      {late === 0 ? `None has been labelled since ${RECENT}.` : `${late} ${late === 1 ? 'has' : 'have'} been labelled since ${RECENT}.`}
      {newest && ` The latest was ${newest.name}, in ${MONTHS[newest.month - 1]} ${newest.year}.`}
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
