import { Link, createFileRoute, getRouteApi, useNavigate } from '@tanstack/react-router'
import { Search as SearchIcon, X } from 'lucide-react'

import { Profile } from '@/components/athar/profile'
import { SectorSwatch, TileMark } from '@/components/athar/tile-mark'
import { cn } from '@/lib/utils'
import { readAsk } from '#/server/api/ask'
import { getStartup, searchStartups, type SearchInput } from '#/server/api/app'

type Search = SearchInput & { open?: string }

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v : undefined)
const num = (v: unknown) => (typeof v === 'number' && v > 0 ? v : typeof v === 'string' && /^\d{4}$/.test(v) ? Number(v) : undefined)
const shell = getRouteApi('/_app')
const decode = (t: string) => t.replace(/&amp;/g, '&').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"')

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

const FLAGS = [
  ['website', 'Lists a website'],
  ['no-website', 'No website'],
  ['no-description', 'No description'],
] as const

// The archive, as a catalogue viewer: filters, the list, and the open record side by side.
function ArchivePage() {
  const { results, selected, profile } = Route.useLoaderData()
  const { viewer } = shell.useLoaderData()
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const { rows, matched, sectors, years, total } = results
  const set = (patch: Partial<Search>) => navigate({ search: (prev) => ({ ...prev, ...patch, open: undefined }) })
  const peak = Math.max(...years.map((y) => y.count), 1)
  const year = search.from && search.from === search.to ? search.from : undefined
  const filtered = Boolean(search.q || search.sector || search.from || search.to || search.flag)

  return (
    <div className="grid flex-1 lg:grid-cols-[18.5rem_minmax(0,1fr)] xl:grid-cols-[18.5rem_22rem_minmax(0,1fr)]">
      <aside aria-label="Filters" className="grid content-start gap-7 border-hairline bg-surface px-5 py-6 lg:sticky lg:top-14 lg:h-[calc(100dvh-3.5rem)] lg:overflow-y-auto lg:border-e">
        <form
          role="search"
          onSubmit={(e) => {
            e.preventDefault()
            const sentence = String(new FormData(e.currentTarget).get('text') ?? '').trim()
            if (!sentence) return set({ q: undefined })
            navigate({ search: { ...readAsk(sentence, sectors.map((s) => s.sector)).filters } })
            e.currentTarget.reset()
          }}
        >
          <label className="flex h-11 items-center gap-2 rounded-full border border-control bg-canvas px-4 focus-within:border-ink">
            <SearchIcon className="size-4 shrink-0 text-ink-2" aria-hidden />
            <span className="sr-only">Search the archive</span>
            <input name="text" placeholder="olive, fintech after 2021…" className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-ink-2" />
          </label>
        </form>

        <section aria-labelledby="f-sector" className="grid gap-2">
          <h2 id="f-sector" className="font-sans text-sm font-medium">Sector</h2>
          <ul className="grid gap-0.5">
            {[...sectors].sort((a, b) => b.count - a.count).map((s) => {
              const on = search.sector === s.sector
              return (
                <li key={s.sector}>
                  <button
                    type="button"
                    aria-pressed={on}
                    onClick={() => set({ sector: on ? undefined : s.sector })}
                    className={cn('flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-start text-sm', on ? 'bg-canvas text-ink shadow-[inset_0_0_0_1px_var(--control)]' : 'text-ink-2 hover:bg-canvas hover:text-ink')}
                  >
                    <SectorSwatch sector={s.sector} size={16} />
                    <span className="min-w-0 flex-1 truncate">{s.sector}</span>
                    <span className="font-mono text-xs">{s.count}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </section>

        <section aria-labelledby="f-year" className="grid gap-3">
          <h2 id="f-year" className="font-sans text-sm font-medium">Labelled</h2>
          <div className="grid grid-cols-7 items-end gap-1.5">
            {years.map((y) => {
              const on = year === y.year
              return (
                <button
                  key={y.year}
                  type="button"
                  aria-pressed={on}
                  title={`${y.year}: ${y.count} startups`}
                  onClick={() => set(on ? { from: undefined, to: undefined } : { from: y.year, to: y.year })}
                  className="group flex flex-col items-stretch justify-end gap-1"
                >
                  <span className={cn('block rounded-t-[3px] transition-colors', on ? 'bg-ochre' : year ? 'bg-hairline group-hover:bg-ochre/60' : 'bg-ochre/45 group-hover:bg-ochre')} style={{ height: `${Math.max(4, Math.round((y.count / peak) * 72))}px` }} />
                  <span className={cn('font-mono text-[0.625rem]', on ? 'text-ink' : 'text-ink-2')}>{String(y.year).slice(2)}</span>
                </button>
              )
            })}
          </div>
        </section>

        <section aria-labelledby="f-shows" className="grid gap-2">
          <h2 id="f-shows" className="font-sans text-sm font-medium">Evidence</h2>
          <div className="flex flex-wrap gap-1.5">
            {FLAGS.map(([k, label]) => {
              const on = search.flag === k
              return (
                <button key={k} type="button" aria-pressed={on} onClick={() => set({ flag: on ? undefined : k })} className={cn('rounded-full border px-3 py-1 text-xs', on ? 'border-ink bg-canvas text-ink' : 'border-control text-ink-2 hover:text-ink')}>
                  {label}
                </button>
              )
            })}
          </div>
        </section>
      </aside>

      <section aria-label="Results" className="flex flex-col border-hairline lg:sticky lg:top-14 lg:h-[calc(100dvh-3.5rem)] lg:border-e">
        <div className="flex items-center justify-between gap-3 border-b border-hairline px-4 py-3">
          <p className="text-sm" aria-live="polite">
            <span className="font-display text-lg font-bold">{matched}</span> <span className="text-ink-2">{matched === total ? 'startups' : `of ${total} startups`}</span>
          </p>
          {filtered && (
            <button type="button" onClick={() => navigate({ search: {} })} className="inline-flex items-center gap-1 text-xs text-ink-2 hover:text-ink">
              Clear <X className="size-3.5" aria-hidden />
            </button>
          )}
        </div>
        {search.q && (
          <p className="border-b border-hairline px-4 py-2 text-xs text-ink-2">
            Words: <span className="text-ink">{search.q}</span>
          </p>
        )}
        {rows.length === 0 ? (
          <div className="grid gap-2 p-5 text-sm">
            <p className="font-medium">No startup matches.</p>
            <p className="text-ink-2">The archive only holds labelled startups. Loosen a filter, or ask it as an idea.</p>
            <Link to="/" className="w-fit">Ask it as an idea</Link>
          </div>
        ) : (
          <ul className="flex-1 divide-y divide-hairline overflow-y-auto">
            {rows.map((r) => {
              const on = r.id === selected
              const body = (
                <>
                  <TileMark id={r.id} sector={r.sector} size={36} />
                  <span className="min-w-0">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="truncate font-display text-base font-bold text-ink">{r.name}</span>
                      <span className="shrink-0 font-mono text-[0.6875rem] text-ink-2">{r.cohort?.slice(3)}</span>
                    </span>
                    <span className={cn('line-clamp-2 text-xs leading-[1.125rem]', r.description ? 'text-ink-2' : 'text-ink-2 italic')}>{r.description ? decode(r.description) : 'No description in the registry'}</span>
                  </span>
                </>
              )
              const cls = (active: boolean) => cn('grid grid-cols-[2.25rem_minmax(0,1fr)] items-start gap-3 px-4 py-3 no-underline', active ? 'bg-surface shadow-[inset_3px_0_0_var(--ochre)]' : 'hover:bg-surface')
              return (
                <li key={r.id}>
                  <Link to="/search" search={(p: Search) => ({ ...p, open: r.id })} aria-current={on ? 'true' : undefined} className={cn(cls(on), 'hidden xl:grid')} resetScroll={false}>
                    {body}
                  </Link>
                  <Link to="/startups/$id" params={{ id: r.id }} className={cn(cls(false), 'xl:hidden')}>
                    {body}
                  </Link>
                </li>
              )
            })}
            {matched > rows.length && <li className="px-4 py-3 text-xs text-ink-2">The first {rows.length} are listed. Add a filter to see the rest.</li>}
          </ul>
        )}
      </section>

      <main className="hidden min-w-0 xl:block">{profile && <Profile key={profile.startup.id} data={profile} compact operator={viewer.role === 'operator'} />}</main>
    </div>
  )
}
