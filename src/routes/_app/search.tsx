import { Link, createFileRoute, getRouteApi, useNavigate } from '@tanstack/react-router'
import { CalendarDays, FileText, Globe, Shapes, TextSearch } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { Profile } from '@/components/athar/profile'
import { Filters } from '@/components/reui/filters/filters'
import { createFilterQuery, createFilterRule, flattenFilterConditions } from '@/components/reui/filters/filters-query'
import type { FilterField, FilterQuery } from '@/components/reui/filters/filters-types'
import { SectorSwatch, TileMark } from '@/components/athar/tile-mark'
import { cn } from '@/lib/utils'
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
    website: s.website === 'yes' || s.website === 'no' ? s.website : undefined,
    described: s.described === 'yes' || s.described === 'no' ? s.described : undefined,
    limit: num(s.limit) ?? (typeof s.limit === 'number' ? s.limit : undefined),
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

// The archive as a ledger beside the open record. Filters are one line; the record is the focal point.
function ArchivePage() {
  const { results, selected, profile } = Route.useLoaderData()
  const { viewer } = shell.useLoaderData()
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const { rows, matched, sectors, years, total } = results
  const [query, setQuery] = useState<FilterQuery>(() => toQuery(search))
  const list = useRef<HTMLUListElement>(null)
  useEffect(() => {
    list.current?.querySelector<HTMLElement>(`[data-id="${selected}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [selected])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
      const t = e.target as HTMLElement | null
      if (t && (t.closest('input, textarea, [role="dialog"], [role="listbox"], [role="menu"], [data-slot="filter-chip"]') || t.isContentEditable)) return
      e.preventDefault()
      const i = rows.findIndex((r) => r.id === selected)
      const next = rows[Math.min(rows.length - 1, Math.max(0, i + (e.key === 'ArrowDown' ? 1 : -1)))]
      if (next && next.id !== selected) navigate({ search: (prev) => ({ ...prev, open: next.id }), resetScroll: false })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [rows, selected, navigate])

  const open = (id: string) => navigate({ search: (prev) => ({ ...prev, open: id }), resetScroll: false })
  const wide = () => typeof window !== 'undefined' && window.matchMedia('(min-width: 1280px)').matches

  return (
    <div className="mx-auto w-full max-w-[100rem] flex-1 px-4 sm:px-8">
      <div className="sticky top-14 z-20 -mx-4 flex items-center gap-4 border-b border-hairline bg-canvas px-4 py-3 sm:-mx-8 sm:px-8">
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

      <div className="grid gap-x-8 xl:grid-cols-12">
        <section aria-label="Ledger" className="xl:col-span-3 xl:border-e xl:border-hairline xl:pe-4">

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
                      className={cn('grid h-12 grid-cols-[1.25rem_minmax(0,1fr)_auto] items-center gap-3 px-3 no-underline outline-none transition-colors duration-150 focus-visible:bg-surface', on ? 'bg-surface' : 'hover:bg-surface/60')}
                    >
                      {r.description ? <TileMark id={r.id} sector={r.sector} size={20} /> : <span aria-label="No description" className="size-5 border border-dashed border-control" />}
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-ink">{r.name}</span>
                        <span className="block truncate text-xs text-ink-2">{r.sector ?? 'No sector'}</span>
                      </span>
                      <span className="font-mono text-xs text-ink-2">{r.cohort?.slice(3)}</span>
                    </Link>
                  </li>
                )
              })}
              {matched > rows.length && (
                <li className="py-4 text-center">
                  <button type="button" onClick={() => navigate({ search: (p) => ({ ...p, limit: rows.length + 100 }), resetScroll: false })} className="inline-flex h-9 items-center rounded-[4px] border border-control px-4 text-sm hover:bg-surface">
                    Show {Math.min(100, matched - rows.length)} more of {matched - rows.length}
                  </button>
                </li>
              )}
            </ul>
          )}
        </section>

        <main className="hidden min-w-0 py-8 xl:col-span-9 xl:block xl:ps-4">{profile && <Profile key={profile.startup.id} data={profile} operator={viewer.role === 'operator'} />}</main>
      </div>
    </div>
  )
}
