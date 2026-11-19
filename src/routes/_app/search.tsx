import { Link, createFileRoute, getRouteApi, useNavigate, type LinkProps } from '@tanstack/react-router'
import { CalendarDays, ChevronsLeft, ChevronsRight, Equal, FileCheck, FileText, FileX, Globe, Link2, Link2Off, Milestone, Quote, Shapes, Sprout, TextSearch, Users } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { PersonRecord } from '@/components/athar/person-record'
import { Profile } from '@/components/athar/profile'
import { ArchivePager } from '@/components/athar/archive-pager'
import { PersonRow, SectorRow, YearRow } from '@/components/athar/archive-rows'
import { Scroller } from '@/components/athar/scroller'
import { SectorRecord } from '@/components/athar/sector-record'
import { SectorSwatch, TileMark } from '@/components/athar/tile-mark'
import { YearRecord } from '@/components/athar/year-record'
import { SegmentedControl } from '@/components/interior/segmented-control'
import { Filters } from '@/components/reui/filters/filters'
import { createFilterQuery, createFilterRule, flattenFilterConditions } from '@/components/reui/filters/filters-query'
import type { FilterField, FilterQuery } from '@/components/reui/filters/filters-types'
import { cn } from '@/lib/utils'
import { parseVentures, parseWebsite } from '#/server/api/archive-sets'
import { getStartup, listPeopleArchive, listSectorsArchive, listYearsArchive, searchStartups, type SearchInput } from '#/server/api/app'
import { getPerson } from '#/server/api/person'
import { getSector } from '#/server/api/sector'
import { getPersonStory } from '#/server/api/story'
import { getLabelYear } from '#/server/api/year'
import { ENTITIES, clampSize, parseEntity, parseSize, type Entity } from '#/shared/archive'

// `in` says what the list holds; `open` is the record in the right pane (a startup id, a person or sector slug, a year).
type Search = Omit<SearchInput, 'ask' | 'size'> & { in?: Entity; size?: number; repeat?: 'yes' }

const ENTITY_LABEL: Record<Entity, string> = { startups: 'Startups', people: 'People', sectors: 'Sectors', years: 'Years' }

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v : typeof v === 'number' && Number.isFinite(v) ? String(v) : undefined)
const num = (v: unknown) => (typeof v === 'number' && v > 0 ? v : typeof v === 'string' && /^\d{4}$/.test(v) ? Number(v) : undefined)
const int = (v: unknown) => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN
  return Number.isInteger(n) && n > 1 ? n : undefined
}
const shell = getRouteApi('/_app')

export const Route = createFileRoute('/_app/search')({
  validateSearch: (s: Record<string, unknown>): Search => {
    const entity = parseEntity(s.in)
    return {
      in: entity === 'startups' ? undefined : entity,
      q: str(s.q),
      sector: str(s.sector),
      from: num(s.from),
      to: num(s.to),
      founded: num(s.founded),
      website: parseWebsite(s.website),
      ventures: parseVentures(s.ventures),
      described: s.described === 'yes' || s.described === 'no' ? s.described : undefined,
      repeat: s.repeat === 'yes' ? 'yes' : undefined,
      page: int(s.page),
      size: parseSize(s.size),
      // A year is kept a number, so the address reads open=2023 and not the quoted string the router would write.
      open: (entity === 'years' && /^\d{4}$/.test(String(s.open)) ? Number(s.open) : str(s.open)) as string | undefined,
    }
  },
  loaderDeps: ({ search }) => search,
  loader: async ({ deps }) => {
    const entity = parseEntity(deps.in)
    const { in: _in, repeat, ...rest } = deps
    const open = deps.open === undefined ? undefined : String(deps.open)
    if (entity === 'people') {
      const list = await listPeopleArchive({ data: { q: deps.q, repeat: repeat === 'yes', page: deps.page, size: deps.size } })
      const selected = open ?? list.rows[0]?.slug
      const [person, story] = selected ? await Promise.all([getPerson({ data: selected }), getPersonStory({ data: selected.replace(/-/g, ' ') })]) : [null, null]
      return { entity, list, selected, record: person && story ? { person, story } : null } as const
    }
    if (entity === 'sectors') {
      const list = await listSectorsArchive({ data: { q: deps.q } })
      const selected = open ?? list.rows[0]?.slug
      return { entity, list, selected, record: selected ? await getSector({ data: selected }) : null } as const
    }
    if (entity === 'years') {
      const list = await listYearsArchive()
      const selected = open ?? list.rows[0]?.year
      return { entity, list, selected, record: selected ? await getLabelYear({ data: selected }) : null } as const
    }
    const results = await searchStartups({ data: rest })
    // The record never changes because the list moved: only fall back to the first row when nothing is open.
    const selected = open ?? results.rows[0]?.id
    return { entity, results, selected, profile: selected ? await getStartup({ data: selected }) : null } as const
  },
  component: ArchivePage,
})

// The filter bar's schema: six attributes, each with an icon and only the conditions the archive can answer.
type Facets = Awaited<ReturnType<typeof searchStartups>>['facets']

function filterFields(sectors: { sector: string; count: number }[], years: { year: number; count: number }[], founded: { year: number; count: number }[], facets: Facets): FilterField[] {
  const n = (count: number) => `${count} startups`
  return [
    { id: 'q', label: 'Words', icon: <TextSearch />, type: 'text', placeholder: 'olive, payment, tutoring', operators: [{ value: 'contains', label: 'contains', icon: <Quote /> }] },
    {
      id: 'sector',
      label: 'Sector',
      icon: <Shapes />,
      type: 'select',
      operators: [{ value: 'is', label: 'is', icon: <Equal /> }],
      options: [...sectors].sort((a, b) => b.count - a.count).map((x) => ({ value: x.sector, label: x.sector, icon: <SectorSwatch sector={x.sector} size={14} />, description: `${x.count} startups` })),
    },
    {
      id: 'labelled',
      label: 'Labelled',
      icon: <CalendarDays />,
      type: 'select',
      operators: [
        { value: 'is', label: 'in', icon: <Equal /> },
        { value: 'after', label: 'after', icon: <ChevronsRight /> },
        { value: 'before', label: 'before', icon: <ChevronsLeft /> },
      ],
      options: years.map((y) => ({ value: String(y.year), label: String(y.year), icon: <CalendarDays />, description: `${y.count} labelled` })),
    },
    {
      id: 'founded',
      label: 'Founded',
      icon: <Sprout />,
      type: 'select',
      operators: [{ value: 'is', label: 'in', icon: <Equal /> }],
      options: founded.map((y) => ({ value: String(y.year), label: String(y.year), icon: <Sprout />, description: `${y.count} founded` })),
    },
    {
      id: 'website',
      label: 'Website',
      icon: <Globe />,
      type: 'select',
      searchable: false,
      operators: [{ value: 'is', label: 'is', icon: <Equal /> }],
      options: [
        { value: 'answers', label: 'answers today', icon: <Link2 />, description: n(facets.website.answers) },
        { value: 'moved', label: 'moved', icon: <Link2 />, description: n(facets.website.moved) },
        { value: 'parked', label: 'parked or gone', icon: <Link2Off />, description: n(facets.website.parked) },
        { value: 'silent', label: 'silent', icon: <Link2Off />, description: n(facets.website.silent) },
        { value: 'yes', label: 'listed', icon: <Link2 />, description: n(facets.website.yes) },
        { value: 'no', label: 'not listed', icon: <Link2Off />, description: n(facets.website.no) },
      ],
    },
    {
      id: 'ventures',
      label: 'Ventures',
      icon: <Users />,
      type: 'select',
      searchable: false,
      operators: [{ value: 'is', label: 'is', icon: <Equal /> }],
      options: [
        { value: 'founders', label: 'founders have another venture', icon: <Milestone />, description: n(facets.ventures.founders) },
        { value: 'names', label: 'has another name', icon: <Quote />, description: n(facets.ventures.names) },
      ],
    },
    { id: 'described', label: 'Description', icon: <FileText />, type: 'select', searchable: false, operators: [{ value: 'is', label: 'is', icon: <Equal /> }], options: [{ value: 'yes', label: 'present', icon: <FileCheck /> }, { value: 'no', label: 'missing', icon: <FileX /> }] },
  ]
}

// Fields for the other entities: words, and for people the founders of more than one startup.
function entityFields(entity: Entity, repeats: number): FilterField[] {
  const words: FilterField = { id: 'q', label: 'Words', icon: <TextSearch />, type: 'text', placeholder: entity === 'people' ? 'a name, in any spelling' : 'a sector', operators: [{ value: 'contains', label: 'contains', icon: <Quote /> }] }
  if (entity === 'sectors') return [words]
  return [
    words,
    {
      id: 'repeat',
      label: 'Founders',
      icon: <Users />,
      type: 'select',
      searchable: false,
      operators: [{ value: 'is', label: 'is', icon: <Equal /> }],
      options: [{ value: 'yes', label: 'on more than one startup', icon: <Milestone />, description: `${repeats} people` }],
    },
  ]
}

type Filtering = Omit<Search, 'open' | 'in' | 'size' | 'page'>

function toQuery(s: Filtering): FilterQuery {
  const rules = []
  if (s.q) rules.push(createFilterRule({ id: 'q', path: ['q'], operator: 'contains', value: s.q }))
  if (s.sector) rules.push(createFilterRule({ id: 'sector', path: ['sector'], operator: 'is', value: s.sector }))
  if (s.from && s.from === s.to) rules.push(createFilterRule({ id: 'labelled', path: ['labelled'], operator: 'is', value: String(s.from) }))
  else if (s.from) rules.push(createFilterRule({ id: 'labelled', path: ['labelled'], operator: 'after', value: String(s.from - 1) }))
  else if (s.to) rules.push(createFilterRule({ id: 'labelled', path: ['labelled'], operator: 'before', value: String(s.to + 1) }))
  if (s.founded) rules.push(createFilterRule({ id: 'founded', path: ['founded'], operator: 'is', value: String(s.founded) }))
  if (s.website) rules.push(createFilterRule({ id: 'website', path: ['website'], operator: 'is', value: s.website }))
  if (s.ventures) rules.push(createFilterRule({ id: 'ventures', path: ['ventures'], operator: 'is', value: s.ventures }))
  if (s.repeat) rules.push(createFilterRule({ id: 'repeat', path: ['repeat'], operator: 'is', value: s.repeat }))
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
    if (c.field === 'founded') out.founded = Number(v)
    if (c.field === 'website') out.website = parseWebsite(v)
    if (c.field === 'ventures') out.ventures = parseVentures(v)
    if (c.field === 'described' && (v === 'yes' || v === 'no')) out.described = v
    if (c.field === 'repeat' && v === 'yes') out.repeat = 'yes'
    if (c.field === 'labelled') {
      const y = Number(v)
      if (c.operator === 'is') (out.from = y), (out.to = y)
      if (c.operator === 'after') out.from = y + 1
      if (c.operator === 'before') out.to = y - 1
    }
  }
  return out
}
type Data = ReturnType<typeof Route.useLoaderData>

/** The bar's filters for the entity shown. Keyed by entity, so switching starts from that entity's own URL filters. */
function ArchiveFilters({ entity, search, data }: { entity: Entity; search: Search; data: Data }) {
  const navigate = useNavigate({ from: Route.fullPath })
  const [query, setQuery] = useState<FilterQuery>(() => toQuery(search))
  if (entity === 'years') return <p className="text-sm text-ink-2">Every year the label was given.</p>
  const fields = data.entity === 'startups' ? filterFields(data.results.sectors, data.results.years, data.results.foundedYears, data.results.facets) : data.entity === 'people' ? entityFields('people', data.list.repeats) : entityFields('sectors', 0)
  return (
    <Filters
      fields={fields}
      query={query}
      showClear
      className="gap-3 [&_[role=toolbar]]:gap-3"
      onQueryChange={(next) => {
        setQuery(next)
        navigate({ search: { in: search.in, size: search.size, ...fromQuery(next) }, resetScroll: false })
      }}
    />
  )
}

// The archive as a workspace: what to browse and its filters on one line, then the ledger and the open record, each scrolling on its own.
function ArchivePage() {
  const data = Route.useLoaderData()
  const { viewer } = shell.useLoaderData()
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const entity = data.entity
  const ledger = useRef<HTMLDivElement>(null)
  const pending = useRef<'first' | 'last' | null>(null)

  // What the list holds, as one shape: ids of the rows on this page, the paging and the bar's count.
  const ids: string[] =
    data.entity === 'startups' ? data.results.rows.map((r) => r.id) : data.entity === 'people' ? data.list.rows.map((r) => r.slug) : data.entity === 'sectors' ? data.list.rows.map((r) => r.slug) : data.list.rows.map((r) => r.year)
  const selected = data.selected
  const paged = data.entity === 'startups' ? data.results : data.entity === 'people' ? data.list : null
  const page = paged?.page ?? 1
  const pages = paged?.pages ?? 1
  const size = paged?.size ?? clampSize(search.size)
  const matched = data.entity === 'startups' ? data.results.matched : data.list.matched
  const total = data.entity === 'startups' ? data.results.total : data.list.total
  const noun = { startups: 'startups', people: 'people', sectors: 'sectors', years: 'years' }[entity]
  const count = matched === total ? `${total.toLocaleString('en-GB')} ${noun}` : `${matched.toLocaleString('en-GB')} of ${total.toLocaleString('en-GB')} ${noun}`

  // A new page starts at the top; an arrow that crossed a page boundary lands on the right row.
  useEffect(() => {
    if (ledger.current) ledger.current.scrollTop = 0
    const edge = pending.current
    pending.current = null
    if (edge && ids.length) navigate({ search: (p) => ({ ...p, open: edge === 'first' ? ids[0] : ids[ids.length - 1] }), resetScroll: false, replace: true })
  }, [page]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    ledger.current?.querySelector<HTMLElement>(`[data-id="${CSS.escape(String(selected))}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [selected])

  const goPage = (n: number) => navigate({ search: (p) => ({ ...p, open: p.open ?? (selected ? String(selected) : undefined), page: n === 1 ? undefined : n }), resetScroll: false })

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.closest('input, textarea, select, [role="dialog"], [role="listbox"], [role="menu"], [role="radiogroup"], [data-slot="filter-chip"]') || t.isContentEditable)) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      // [ and ] turn the page, the same as the Previous and Next links.
      if (e.key === '[' && page > 1) return void goPage(page - 1)
      if (e.key === ']' && page < pages) return void goPage(page + 1)
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
      e.preventDefault()
      const i = ids.findIndex((r) => r === selected)
      const down = e.key === 'ArrowDown'
      if (down && i === ids.length - 1 && page < pages) {
        pending.current = 'first'
        return goPage(page + 1)
      }
      if (!down && i === 0 && page > 1) {
        pending.current = 'last'
        return goPage(page - 1)
      }
      const next = ids[Math.min(ids.length - 1, Math.max(0, i + (down ? 1 : -1)))]
      if (next && next !== selected) navigate({ search: (p) => ({ ...p, open: next }), resetScroll: false })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [ids, selected, page, pages, navigate]) // eslint-disable-line react-hooks/exhaustive-deps

  const filtering = data.entity === 'startups' ? flattenFilterConditions(toQuery(search)).length : 0
  // The same list at another page: the record stays where it was.
  const pageLink = (n: number): LinkProps => ({ to: '/search', search: ((p: Search) => ({ ...p, open: p.open ?? (selected ? String(selected) : undefined), page: n === 1 ? undefined : n })) as never, resetScroll: false })
  const open = (id: string) => (e: React.MouseEvent) => {
    if (!window.matchMedia('(min-width: 1280px)').matches) return
    e.preventDefault()
    // A year goes in the address as a number (open=2023), not as the quoted string the router would otherwise write.
    navigate({ search: (p) => ({ ...p, open: (entity === 'years' ? Number(id) : id) as string }), resetScroll: false })
  }
  const empty = ids.length === 0
  const Empty = () => (
    <div className="grid gap-2 py-10 text-sm">
      <p className="font-display text-xl font-bold">No {entity === 'startups' ? 'startup' : entity === 'people' ? 'person' : 'sector'} matches.</p>
      <p className="text-ink">
        {filtering > 1 ? `No labelled startup fits all ${filtering} filters at once; remove one to widen the list.` : 'Nothing in the registry fits this filter; clear it to see the whole list.'}
      </p>
      {entity === 'startups' && <Link to="/" className="w-fit">Ask it as an idea</Link>}
    </div>
  )

  return (
    <main className="grid w-full flex-1 grid-cols-[minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)] px-4 sm:px-8 xl:h-[calc(100dvh-57px)] xl:flex-none xl:overflow-hidden">
      <div role="search" aria-label="Browse and filter the archive" className="-mx-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-hairline px-4 py-3.5 sm:-mx-8 sm:px-8">
        <SegmentedControl
          label="Browse the archive by"
          options={ENTITIES.map((v) => ({ value: v, label: ENTITY_LABEL[v] }))}
          value={entity}
          onValueChange={(v) => navigate({ search: { in: v === 'startups' ? undefined : (v as Entity), size: search.size }, resetScroll: false })}
        />
        <div className="min-w-0 basis-full sm:basis-0 sm:flex-1">
          <ArchiveFilters key={entity} entity={entity} search={search} data={data} />
        </div>
        <p className="shrink-0 border-s border-hairline ps-5 text-sm text-ink" aria-live="polite">
          {count}
        </p>
      </div>

      <div className="grid min-h-0 grid-cols-[minmax(0,1fr)] gap-x-8 xl:grid-cols-12">
        <section aria-label="Ledger" className="flex min-h-0 flex-col xl:col-span-4 xl:border-e xl:border-hairline 2xl:col-span-3">
          {empty ? (
            <Empty />
          ) : (
            <Scroller ref={ledger} className="flex-1 xl:-ms-3 xl:pe-3" label={`${ENTITY_LABEL[entity]} on this page`}>
              <ul>
                {data.entity === 'startups' &&
                  data.results.rows.map((r) => {
                    const on = r.id === selected
                    return (
                      <li key={r.id} className="border-b border-hairline">
                        <Link
                          to="/startups/$id"
                          params={{ id: r.id }}
                          data-id={r.id}
                          aria-current={on ? 'page' : undefined}
                          onClick={open(r.id)}
                          className={cn('grid h-11 grid-cols-[1.25rem_minmax(0,1fr)_auto] items-center gap-3 px-3 no-underline transition-colors duration-150 -outline-offset-2 focus-visible:bg-surface motion-reduce:transition-none xl:h-10', on ? 'bg-surface shadow-[inset_2px_0_0_var(--glaze)]' : 'hover:bg-surface')}
                        >
                          {r.description ? <TileMark id={r.id} sector={r.sector} size={20} title={r.sector ?? undefined} /> : <span role="img" aria-label="No description" className="size-5 border border-dashed border-edge" />}
                          <span className="truncate text-sm font-medium text-ink">{r.name}</span>
                          <span className="font-mono text-[0.8125rem] text-ink-3">{r.labelled?.slice(0, 4)}</span>
                        </Link>
                      </li>
                    )
                  })}
                {data.entity === 'people' && data.list.rows.map((r) => <li key={r.slug} className="border-b border-hairline"><PersonRow item={r} on={r.slug === selected} onOpen={open(r.slug)} /></li>)}
                {data.entity === 'sectors' && data.list.rows.map((r) => <li key={r.slug} className="border-b border-hairline"><SectorRow item={r} on={r.slug === selected} onOpen={open(r.slug)} /></li>)}
                {data.entity === 'years' && data.list.rows.map((r) => <li key={r.year} className="border-b border-hairline"><YearRow item={r} on={r.year === selected} onOpen={open(r.year)} /></li>)}
              </ul>
            </Scroller>
          )}

          {paged && matched > 0 && (
            <ArchivePager
              page={page}
              pages={pages}
              size={size}
              shown={ids.length}
              total={matched}
              noun={ENTITY_LABEL[entity]}
              linkTo={pageLink}
              onPage={goPage}
              onSize={(s) => navigate({ search: (p) => ({ ...p, open: p.open ?? (selected ? String(selected) : undefined), page: undefined, size: s === 20 ? undefined : s }), resetScroll: false })}
            />
          )}
        </section>

        <Scroller className="hidden xl:col-span-8 xl:block 2xl:col-span-9" label="Open record">
          <section aria-label="Open record" className="min-w-0 py-8 xl:ps-4 xl:pe-4">
            {data.entity === 'startups' && data.profile && <Profile key={data.profile.startup.id} data={data.profile} operator={viewer.role === 'operator'} />}
            {data.entity === 'people' && data.record && <PersonRecord key={data.record.person.slug} data={data.record.person} story={data.record.story} />}
            {data.entity === 'sectors' && data.record && <SectorRecord key={data.record.slug} data={data.record} />}
            {data.entity === 'years' && data.record && <YearRecord key={data.record.year} data={data.record} />}
          </section>
        </Scroller>
      </div>
    </main>
  )
}
