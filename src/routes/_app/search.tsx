import { barY, defineChart } from '@tanstack/charts'
import { Chart } from '@tanstack/charts/react'
import { scaleBand } from '@tanstack/charts/scales/band'
import { scaleLinear } from '@tanstack/charts/scales/linear'
import { Link, createFileRoute, getRouteApi, useNavigate } from '@tanstack/react-router'
import { ChevronDown, Search as SearchIcon, X } from 'lucide-react'
import { Popover } from 'radix-ui'
import { useMemo, useRef } from 'react'

import { Profile, catalogueNo } from '@/components/athar/profile'
import { SectorSwatch, TileMark } from '@/components/athar/tile-mark'
import { SegmentedControl } from '@/components/interior/segmented-control'
import { ValueFlash } from '@/components/interior/value-flash'
import { cn } from '@/lib/utils'
import { readAsk } from '#/server/api/ask'
import { getStartup, searchStartups, type SearchInput } from '#/server/api/app'

type Search = SearchInput & { open?: string }

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v : undefined)
const num = (v: unknown) => (typeof v === 'number' && v > 0 ? v : typeof v === 'string' && /^\d{4}$/.test(v) ? Number(v) : undefined)
const shell = getRouteApi('/_app')

export const Route = createFileRoute('/_app/search')({
  validateSearch: (s: Record<string, unknown>): Search => ({
    q: str(s.q),
    sector: str(s.sector),
    from: num(s.from),
    to: num(s.to),
    flag: s.flag === 'no-description' || s.flag === 'website' || s.flag === 'no-website' ? s.flag : undefined,
    open: str(s.open),
  }),
  loaderDeps: ({ search }) => search,
  loader: async ({ deps: { open, ...filters } }) => {
    const results = await searchStartups({ data: filters })
    const selected = open ?? results.rows[0]?.id
    return { results, selected, profile: selected ? await getStartup({ data: selected }) : null }
  },
  component: ArchivePage,
})

const EVIDENCE = [
  { value: 'all', label: 'All' },
  { value: 'website', label: 'Website' },
  { value: 'no-website', label: 'No website' },
  { value: 'no-description', label: 'No description' },
]

// The archive as a ledger beside the open record. Filters are one line; the record is the focal point.
function ArchivePage() {
  const { results, selected, profile } = Route.useLoaderData()
  const { viewer } = shell.useLoaderData()
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const { rows, matched, sectors, years, total } = results
  const set = (patch: Partial<Search>) => navigate({ search: (prev) => ({ ...prev, ...patch, open: undefined }) })
  const year = search.from && search.from === search.to ? search.from : undefined
  const filtered = Boolean(search.q || search.sector || search.from || search.to || search.flag)
  const list = useRef<HTMLUListElement>(null)

  const open = (id: string) => navigate({ search: (prev) => ({ ...prev, open: id }), resetScroll: false })
  const wide = () => typeof window !== 'undefined' && window.matchMedia('(min-width: 1280px)').matches

  const brush = useMemo(
    () =>
      defineChart({
        marks: [barY(years, { x: (d: { year: number }) => String(d.year), y: 'count', fill: (d: { year: number }) => (d.year === year ? 'var(--ochre)' : 'var(--control)'), inset: 1.5 })],
        scales: { x: { scale: () => scaleBand<string>().padding(0.18), axis: false }, y: { scale: scaleLinear, axis: false } },
      }),
    [years, year],
  )

  return (
    <div className="mx-auto w-full max-w-[100rem] flex-1 px-4 sm:px-8">
      <div className="sticky top-14 z-20 -mx-4 flex flex-wrap items-center gap-3 border-b border-hairline bg-canvas px-4 py-3 sm:-mx-8 sm:px-8">
        <form
          role="search"
          className="min-w-0 flex-1 basis-80"
          onSubmit={(e) => {
            e.preventDefault()
            const sentence = String(new FormData(e.currentTarget).get('text') ?? '').trim()
            if (!sentence) return set({ q: undefined })
            navigate({ search: { ...readAsk(sentence, sectors.map((s) => s.sector)).filters } })
            e.currentTarget.reset()
          }}
        >
          <label className="flex h-10 items-center gap-2 rounded-full border border-control bg-surface px-4 focus-within:border-ink">
            <SearchIcon className="size-4 shrink-0 text-ink-2" aria-hidden />
            <span className="sr-only">Search the archive</span>
            <input name="text" placeholder={search.q ? `Words: ${search.q}` : 'fintech since 2021 selling to banks'} className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-ink-2" />
            {search.q && (
              <button type="button" onClick={() => set({ q: undefined })} aria-label="Clear the words" className="text-ink-2 hover:text-ink">
                <X className="size-4" />
              </button>
            )}
          </label>
        </form>

        <Popover.Root>
          <Popover.Trigger className={cn('inline-flex h-10 items-center gap-2 rounded-full border px-4 text-sm', search.sector ? 'border-glaze text-ink' : 'border-control text-ink-2 hover:text-ink')}>
            {search.sector ? (
              <>
                <SectorSwatch sector={search.sector} /> {search.sector}
              </>
            ) : (
              'Sector'
            )}
            <ChevronDown className="size-4" aria-hidden />
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content align="start" sideOffset={6} className="z-50 max-h-[70dvh] w-80 overflow-y-auto rounded-md border border-hairline bg-canvas p-1.5 shadow-[0_8px_24px_rgb(0_0_0/0.25)]">
              <Popover.Close asChild>
                <button type="button" onClick={() => set({ sector: undefined })} className="flex w-full items-center rounded-sm px-2.5 py-2 text-start text-sm text-ink-2 hover:bg-surface">
                  Every sector
                </button>
              </Popover.Close>
              {[...sectors].sort((a, b) => b.count - a.count).map((s) => (
                <Popover.Close asChild key={s.sector}>
                  <button type="button" onClick={() => set({ sector: s.sector })} className={cn('flex w-full items-center gap-2.5 rounded-sm px-2.5 py-2 text-start text-sm hover:bg-surface', search.sector === s.sector && 'bg-surface')}>
                    <SectorSwatch sector={s.sector} size={16} />
                    <span className="min-w-0 flex-1 truncate">{s.sector}</span>
                    <span className="font-mono text-xs text-ink-2">{s.count}</span>
                  </button>
                </Popover.Close>
              ))}
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>

        <div className="flex items-center gap-2" role="group" aria-label="Labelled year">
          <div className="h-9 w-40">
            <Chart definition={brush} height={36} initialWidth={160} ariaLabel="Startups labelled each year; choose a year" onSelect={(p) => p && set(year === p.datum.year ? { from: undefined, to: undefined } : { from: p.datum.year, to: p.datum.year })} />
          </div>
          <span className="w-16 font-mono text-xs text-ink-2">{year ? `in ${year}` : search.from || search.to ? `${search.from ?? '…'}–${search.to ?? '…'}` : '2019–25'}</span>
        </div>

        <SegmentedControl label="Evidence" options={EVIDENCE} value={search.flag ?? 'all'} onValueChange={(v) => set({ flag: v === 'all' ? undefined : (v as Search['flag']) })} className="text-sm" />

        <p className="ms-auto flex items-baseline gap-1.5 text-sm text-ink-2" aria-live="polite">
          <ValueFlash value={matched} className="font-mono text-base text-ink" label="Startups shown" />
          of {total}
          {filtered && (
            <button type="button" onClick={() => navigate({ search: {} })} className="ms-2 text-xs underline underline-offset-4 hover:text-ink">
              Clear
            </button>
          )}
        </p>
      </div>

      <div className="grid gap-x-8 xl:grid-cols-12">
        <section aria-label="Ledger" className="xl:col-span-5 xl:border-e xl:border-hairline">
          {rows.length === 0 ? (
            <div className="grid gap-2 py-10 text-sm">
              <p className="font-display text-xl font-bold">No startup matches.</p>
              <p className="text-ink-2">The archive only holds labelled startups. Loosen a filter, or ask it as an idea.</p>
              <Link to="/" className="w-fit">Ask it as an idea</Link>
            </div>
          ) : (
            <ul
              ref={list}
              className="xl:-ms-3"
              onKeyDown={(e) => {
                if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
                e.preventDefault()
                const i = rows.findIndex((r) => r.id === selected)
                const next = rows[Math.min(rows.length - 1, Math.max(0, i + (e.key === 'ArrowDown' ? 1 : -1)))]
                if (next) {
                  open(next.id)
                  list.current?.querySelector<HTMLAnchorElement>(`[data-id="${next.id}"]`)?.focus()
                }
              }}
            >
              {rows.map((r) => {
                const on = r.id === selected
                return (
                  <li key={r.id} className="border-b border-hairline">
                    <Link
                      to="/startups/$id"
                      params={{ id: r.id }}
                      data-id={r.id}
                      aria-current={on ? 'true' : undefined}
                      onClick={(e) => {
                        if (!wide()) return
                        e.preventDefault()
                        open(r.id)
                      }}
                      className={cn('grid h-16 grid-cols-[5.25rem_1.75rem_minmax(0,1fr)_auto] items-center gap-3 border-s-2 ps-3 pe-2 no-underline', on ? 'border-glaze bg-surface' : 'border-transparent hover:bg-surface')}
                    >
                      <span className="font-mono text-xs text-ink-2">{catalogueNo(r.row)}</span>
                      {r.description ? <TileMark id={r.id} sector={r.sector} size={28} /> : <span aria-label="No description" className="size-7 border border-dashed border-control" />}
                      <span className="min-w-0">
                        <span className="block truncate text-[0.9375rem] font-medium text-ink">{r.name}</span>
                        <span className="block truncate text-xs text-ink-2">{r.sector ?? 'No sector'}</span>
                      </span>
                      <span className="font-mono text-xs text-ink-2">{r.cohort?.slice(3)}</span>
                    </Link>
                  </li>
                )
              })}
              {matched > rows.length && <li className="py-4 ps-3 text-xs text-ink-2">The first {rows.length} are listed. Add a filter to see the rest.</li>}
            </ul>
          )}
        </section>

        <main className="hidden min-w-0 py-8 xl:col-span-7 xl:block">{profile && <Profile key={profile.startup.id} data={profile} operator={viewer.role === 'operator'} />}</main>
      </div>
    </div>
  )
}
