import { Link, createFileRoute, getRouteApi, useNavigate } from '@tanstack/react-router'
import { CalendarDays, ChevronLeft, ChevronRight, FileText, Globe, Shapes, TextSearch } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { Profile } from '@/components/athar/profile'
import { Scroller } from '@/components/athar/scroller'
import { SectorSwatch, TileMark } from '@/components/athar/tile-mark'
import { paginate } from '@/components/interior/pagination'
import { Filters } from '@/components/reui/filters/filters'
import { createFilterQuery, createFilterRule, flattenFilterConditions } from '@/components/reui/filters/filters-query'
import type { FilterField, FilterQuery } from '@/components/reui/filters/filters-types'
import { cn } from '@/lib/utils'
import { PAGE_SIZE, getStartup, searchStartups, type SearchInput } from '#/server/api/app'

type Search = Omit<SearchInput, 'open'> & { open?: string }

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v : undefined)
const num = (v: unknown) => (typeof v === 'number' && v > 0 ? v : typeof v === 'string' && /^\d{4}$/.test(v) ? Number(v) : undefined)
const int = (v: unknown) => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN
  return Number.isInteger(n) && n > 1 ? n : undefined
}
const shell = getRouteApi('/_app')

export const Route = createFileRoute('/_app/search')({
  validateSearch: (s: Record<string, unknown>): Search => ({
    q: str(s.q),
    sector: str(s.sector),
    from: num(s.from),
    to: num(s.to),
    website: s.website === 'yes' || s.website === 'no' ? s.website : undefined,
    described: s.described === 'yes' || s.described === 'no' ? s.described : undefined,
    page: int(s.page),
    open: str(s.open),
  }),
  loaderDeps: ({ search }) => search,
  loader: async ({ deps }) => {
    const results = await searchStartups({ data: deps })
    // The record never changes because the list moved: only fall back to the first row when nothing is open.
    const selected = deps.open ?? results.rows[0]?.id
    return { results, selected, profile: selected ? await getStartup({ data: selected }) : null }
  },
  component: ArchivePage,
})

// The filter bar's schema: five attributes, each with an icon and only the conditions the archive can answer.
function filterFields(sectors: { sector: string; count: number }[], years: { year: number; count: number }[]): FilterField[] {
  return [
    { id: 'q', label: 'Words', icon: <TextSearch />, type: 'text', placeholder: 'olive, payment, tutoring', operators: [{ value: 'contains', label: 'contains' }] },
    {
      id: 'sector',
      label: 'Sector',
      icon: <Shapes />,
      type: 'select',
      operators: [{ value: 'is', label: 'is' }],
      options: [...sectors].sort((a, b) => b.count - a.count).map((x) => ({ value: x.sector, label: x.sector, icon: <SectorSwatch sector={x.sector} size={14} />, description: `${x.count} startups` })),
    },
    {
      id: 'labelled',
      label: 'Labelled',
      icon: <CalendarDays />,
      type: 'select',
      operators: [
        { value: 'is', label: 'in' },
        { value: 'after', label: 'after' },
        { value: 'before', label: 'before' },
      ],
      options: years.map((y) => ({ value: String(y.year), label: String(y.year), description: `${y.count} labelled` })),
    },
    { id: 'website', label: 'Website', icon: <Globe />, type: 'select', searchable: false, operators: [{ value: 'is', label: 'is' }], options: [{ value: 'yes', label: 'listed' }, { value: 'no', label: 'not listed' }] },
    { id: 'described', label: 'Description', icon: <FileText />, type: 'select', searchable: false, operators: [{ value: 'is', label: 'is' }], options: [{ value: 'yes', label: 'present' }, { value: 'no', label: 'missing' }] },
  ]
}

type Filtering = Omit<Search, 'open'>

function toQuery(s: Filtering): FilterQuery {
  const rules = []
  if (s.q) rules.push(createFilterRule({ id: 'q', path: ['q'], operator: 'contains', value: s.q }))
  if (s.sector) rules.push(createFilterRule({ id: 'sector', path: ['sector'], operator: 'is', value: s.sector }))
  if (s.from && s.from === s.to) rules.push(createFilterRule({ id: 'labelled', path: ['labelled'], operator: 'is', value: String(s.from) }))
  else if (s.from) rules.push(createFilterRule({ id: 'labelled', path: ['labelled'], operator: 'after', value: String(s.from - 1) }))
  else if (s.to) rules.push(createFilterRule({ id: 'labelled', path: ['labelled'], operator: 'before', value: String(s.to + 1) }))
  if (s.website) rules.push(createFilterRule({ id: 'website', path: ['website'], operator: 'is', value: s.website }))
  if (s.described) rules.push(createFilterRule({ id: 'described', path: ['described'], operator: 'is', value: s.described }))
  return createFilterQuery(rules)
}

function fromQuery(q: FilterQuery): Filtering {
  const out: Filtering = {}
  for (const c of flattenFilterConditions(q)) {
    const v = String(c.values[0] ?? '')
    if (!v) continue
    if (c.field === 'q') out.q = v
    if (c.field === 'sector') out.sector = v
    if (c.field === 'website' && (v === 'yes' || v === 'no')) out.website = v
    if (c.field === 'described' && (v === 'yes' || v === 'no')) out.described = v
    if (c.field === 'labelled') {
      const y = Number(v)
      if (c.operator === 'is') (out.from = y), (out.to = y)
      if (c.operator === 'after') out.from = y + 1
      if (c.operator === 'before') out.to = y - 1
    }
  }
  return out
}
// The archive as a workspace: filters on one line, then the ledger and the open record, each scrolling on its own.
function ArchivePage() {
  const { results, selected, profile } = Route.useLoaderData()
  const { viewer } = shell.useLoaderData()
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const { rows, matched, page, pages, sectors, years, total } = results
  const [query, setQuery] = useState<FilterQuery>(() => toQuery(search))
  const ledger = useRef<HTMLDivElement>(null)
  const pending = useRef<'first' | 'last' | null>(null)

  // A new page starts at the top; an arrow that crossed a page boundary lands on the right row.
  useEffect(() => {
    if (ledger.current) ledger.current.scrollTop = 0
    const edge = pending.current
    pending.current = null
    if (edge && rows.length) navigate({ search: (p) => ({ ...p, open: (edge === 'first' ? rows[0] : rows[rows.length - 1]).id }), resetScroll: false, replace: true })
  }, [page]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    ledger.current?.querySelector<HTMLElement>(`[data-id="${selected}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [selected])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
      const t = e.target as HTMLElement | null
      if (t && (t.closest('input, textarea, [role="dialog"], [role="listbox"], [role="menu"], [data-slot="filter-chip"]') || t.isContentEditable)) return
      e.preventDefault()
      const i = rows.findIndex((r) => r.id === selected)
      const down = e.key === 'ArrowDown'
      if (down && i === rows.length - 1 && page < pages) {
        pending.current = 'first'
        return navigate({ search: (p) => ({ ...p, open: p.open ?? selected, page: page + 1 }), resetScroll: false })
      }
      if (!down && i === 0 && page > 1) {
        pending.current = 'last'
        return navigate({ search: (p) => ({ ...p, open: p.open ?? selected, page: page - 1 === 1 ? undefined : page - 1 }), resetScroll: false })
      }
      const next = rows[Math.min(rows.length - 1, Math.max(0, i + (down ? 1 : -1)))]
      if (next && next.id !== selected) navigate({ search: (p) => ({ ...p, open: next.id }), resetScroll: false })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [rows, selected, page, pages, navigate])

  const first = (page - 1) * PAGE_SIZE + 1
  const last = Math.min(matched, page * PAGE_SIZE)
  const pageLink = (n: number) => ({ to: '/search' as const, search: (p: Search) => ({ ...p, open: p.open ?? selected, page: n === 1 ? undefined : n }), resetScroll: false, preload: 'intent' as const })

  return (
    <div className="mx-auto grid w-full max-w-[100rem] flex-1 grid-rows-[auto_minmax(0,1fr)] px-4 sm:px-8 xl:h-[calc(100dvh-57px)] xl:flex-none xl:overflow-hidden">
      <div className="-mx-4 flex items-center gap-4 border-b border-hairline px-4 py-3 sm:-mx-8 sm:px-8">
        <div className="min-w-0 flex-1">
          <Filters
            fields={filterFields(sectors, years)}
            query={query}
            showClear
            onQueryChange={(next) => {
              setQuery(next)
              navigate({ search: { ...fromQuery(next) }, resetScroll: false })
            }}
          />
        </div>
        <p className="shrink-0 text-sm text-ink-2" aria-live="polite">
          {matched === total ? `${total} startups` : `${matched} of ${total}`}
        </p>
      </div>

      <div className="grid min-h-0 gap-x-8 xl:grid-cols-12">
        <section aria-label="Ledger" className="flex min-h-0 flex-col xl:col-span-3 xl:border-e xl:border-hairline">
          {rows.length === 0 ? (
            <div className="grid gap-2 py-10 text-sm">
              <p className="font-display text-xl font-bold">No startup matches.</p>
              <p className="text-ink-2">The archive only holds labelled startups. Loosen a filter, or ask it as an idea.</p>
              <Link to="/" className="w-fit">Ask it as an idea</Link>
            </div>
          ) : (
            <Scroller ref={ledger} className="flex-1 xl:-ms-3 xl:pe-3" label="Startups on this page">
              <ul>
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
                          if (!window.matchMedia('(min-width: 1280px)').matches) return
                          e.preventDefault()
                          navigate({ search: (p) => ({ ...p, open: r.id }), resetScroll: false })
                        }}
                        className={cn('grid h-10 grid-cols-[1.25rem_minmax(0,1fr)_auto] items-center gap-3 px-3 no-underline outline-none transition-colors duration-150 focus-visible:bg-surface', on ? 'bg-surface' : 'hover:bg-surface/60')}
                      >
                        {r.description ? <TileMark id={r.id} sector={r.sector} size={20} title={r.sector ?? undefined} /> : <span aria-label="No description" className="size-5 border border-dashed border-control" />}
                        <span className="truncate text-sm font-medium text-ink">{r.name}</span>
                        <span className="font-mono text-xs text-ink-2">{r.cohort?.slice(3)}</span>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </Scroller>
          )}

          {matched > PAGE_SIZE && (
            <nav aria-label="Ledger pages" className="flex items-center justify-between gap-3 border-t border-hairline py-2.5 xl:-ms-3 xl:pe-3 xl:ps-3">
              <span className="font-mono text-xs whitespace-nowrap text-ink-2">
                {first}–{last} of {matched}
              </span>
              <ol className="flex items-center gap-0.5">
                <li>
                  {page > 1 ? (
                    <Link {...pageLink(page - 1)} aria-label="Previous page" className="grid size-8 place-content-center rounded-[4px] text-ink-2 no-underline hover:bg-surface hover:text-ink">
                      <ChevronLeft className="size-4" />
                    </Link>
                  ) : (
                    <span aria-disabled="true" className="grid size-8 place-content-center text-hairline">
                      <ChevronLeft className="size-4" />
                    </span>
                  )}
                </li>
                {paginate(page, pages, 0, 1).map((item) =>
                  typeof item === 'number' ? (
                    <li key={item}>
                      <Link
                        {...pageLink(item)}
                        aria-current={item === page ? 'page' : undefined}
                        className={cn('grid h-8 min-w-8 place-content-center rounded-[4px] px-1.5 font-mono text-xs no-underline', item === page ? 'bg-surface-raised text-ink' : 'text-ink-2 hover:bg-surface hover:text-ink')}
                      >
                        {item}
                      </Link>
                    </li>
                  ) : (
                    <li key={item} aria-hidden className="grid h-8 w-5 place-content-center font-mono text-xs text-ink-2">
                      …
                    </li>
                  ),
                )}
                <li>
                  {page < pages ? (
                    <Link {...pageLink(page + 1)} aria-label="Next page" className="grid size-8 place-content-center rounded-[4px] text-ink-2 no-underline hover:bg-surface hover:text-ink">
                      <ChevronRight className="size-4" />
                    </Link>
                  ) : (
                    <span aria-disabled="true" className="grid size-8 place-content-center text-hairline">
                      <ChevronRight className="size-4" />
                    </span>
                  )}
                </li>
              </ol>
            </nav>
          )}
        </section>

        <Scroller className="hidden xl:col-span-9 xl:block" label="Open record">
          <main className="min-w-0 py-8 xl:ps-4 xl:pe-4">{profile && <Profile key={profile.startup.id} data={profile} operator={viewer.role === 'operator'} />}</main>
        </Scroller>
      </div>
    </div>
  )
}
