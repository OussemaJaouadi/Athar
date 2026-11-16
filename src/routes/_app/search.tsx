import { Link, createFileRoute, getRouteApi, useNavigate } from '@tanstack/react-router'
import { Search as SearchIcon, X } from 'lucide-react'

import { Profile } from '@/components/athar/profile'
import { Button } from '@/components/ui/button'
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
  component: SearchPage,
})

const FLAG_LABEL = { 'no-description': 'No description', website: 'Has a website', 'no-website': 'No website' } as const

// Search: results stay beside the selected profile (DESIGN.md workspace). Below lg they are separate views.
function SearchPage() {
  const { results, selected, profile } = Route.useLoaderData()
  const { viewer } = shell.useLoaderData()
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const { rows, matched, sectors, years, total } = results

  if (total === 0) return <EmptyArchive />

  const set = (patch: Partial<Search>) => navigate({ search: (prev) => ({ ...prev, ...patch, open: undefined }) })
  const chips = [
    search.q && { k: 'q' as const, name: 'Words', value: search.q },
    (search.from || search.to) && search.from !== search.to && { k: 'years' as const, name: 'Labelled', value: search.to ? (search.from ? `${search.from}–${search.to}` : `until ${search.to}`) : `from ${search.from}` },
  ].filter(Boolean) as { k: 'q' | 'sector' | 'years' | 'flag'; name: string; value: string }[]

  return (
    <div className="grid flex-1 lg:grid-cols-[20rem_minmax(0,1fr)]">
      <aside aria-label="Search results" className="flex flex-col border-hairline bg-canvas lg:sticky lg:top-14 lg:h-[calc(100dvh-3.5rem)] lg:border-e">
        <div className="grid gap-3 border-b border-hairline p-4">
          <form
            role="search"
            onSubmit={(e) => {
              e.preventDefault()
              const sentence = String(new FormData(e.currentTarget).get('text') ?? '').trim()
              if (!sentence) return set({ q: undefined })
              const { filters } = readAsk(sentence, sectors.map((s) => s.sector))
              navigate({ search: { ...filters } })
              e.currentTarget.reset()
            }}
          >
            <label className="flex h-10 items-center gap-2 rounded-[4px] border border-control bg-canvas px-3 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-glaze">
              <SearchIcon className="size-4 shrink-0 text-ink-2" aria-hidden />
              <span className="sr-only">Search the registry</span>
              <input name="text" placeholder="olive farmers, fintech after 2021…" className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-ink-2" />
            </label>
          </form>

          {chips.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {chips.map((c) => (
                <span key={c.k} className="inline-flex min-h-7 items-center gap-1.5 rounded-[4px] border border-control bg-surface py-0.5 ps-2.5 pe-1 text-[0.8125rem]">
                  <span className="text-ink-2">{c.name}</span> {c.value}
                  <button
                    type="button"
                    aria-label={`Remove ${c.name.toLowerCase()}`}
                    onClick={() => set(c.k === 'years' ? { from: undefined, to: undefined } : { [c.k]: undefined })}
                    className="grid size-5 place-content-center rounded-[4px] text-ink-2 hover:bg-surface-raised hover:text-ink"
                  >
                    <X className="size-3.5" />
                  </button>
                </span>
              ))}
            </div>
          )}

          <div className="flex flex-wrap gap-1.5">
            <Pick label="Sector" value={search.sector} options={sectors.map((s) => [s.sector, `${s.sector} (${s.count})`])} onChange={(v) => set({ sector: v })} />
            <Pick label="Labelled" value={search.from && search.from === search.to ? String(search.from) : undefined} options={years.map((y) => [String(y.year), `${y.year} (${y.count})`])} onChange={(v) => set({ from: v ? Number(v) : undefined, to: v ? Number(v) : undefined })} />
            <Pick label="Shows" value={search.flag} options={Object.entries(FLAG_LABEL)} onChange={(v) => set({ flag: v as Search['flag'] })} />
          </div>
          <p className="text-[0.8125rem] text-ink-2" aria-live="polite">
            {matched === total ? `${total} startups` : `${matched} of ${total} startups`}
          </p>
        </div>

        {rows.length === 0 ? (
          <div className="grid gap-2 p-5 text-sm">
            <p className="font-medium">No startup matches.</p>
            <p className="text-ink-2">The registry only holds labelled startups. Remove a filter, or check the idea itself.</p>
            <Link to="/idea" className="w-fit">Check it as an idea</Link>
          </div>
        ) : (
          <ul className="m-0 grid list-none gap-0.5 overflow-y-auto p-2">
            {rows.map((r) => {
              const body = (
                <>
                  <span className="font-medium text-ink">{r.name}</span>
                  <span className={cn('line-clamp-1 text-[0.8125rem] leading-[1.125rem]', r.description ? 'text-ink-2' : 'text-ink-2 italic')}>{r.description ?? 'No description in the registry'}</span>
                </>
              )
              const cls = (on: boolean) => cn('grid gap-0.5 rounded-[4px] px-3 py-2.5 no-underline hover:bg-surface', on && 'bg-surface-raised shadow-[inset_0_0_0_2px_var(--ink)]')
              return (
                <li key={r.id}>
                  <Link to="/search" search={(p: Search) => ({ ...p, open: r.id })} aria-current={r.id === selected ? 'true' : undefined} className={cn(cls(r.id === selected), 'hidden lg:grid')} resetScroll={false}>
                    {body}
                  </Link>
                  <Link to="/startups/$id" params={{ id: r.id }} className={cn(cls(false), 'lg:hidden')}>
                    {body}
                  </Link>
                </li>
              )
            })}
            {matched > rows.length && <li className="px-3 py-3 text-[0.8125rem] text-ink-2">The first {rows.length} are shown. Add a filter to see the rest.</li>}
          </ul>
        )}
      </aside>

      <main className="hidden min-w-0 lg:block">{profile && <Profile key={profile.startup.id} data={profile} compact operator={viewer.role === 'operator'} />}</main>
    </div>
  )
}

/** A filter as a native select dressed as a chip: keyboard and screen readers get the real control. */
function Pick({ label, value, options, onChange }: { label: string; value?: string; options: [string, string][]; onChange: (v: string | undefined) => void }) {
  return (
    <label className={cn('relative inline-flex min-h-7 items-center rounded-[4px] border px-2.5 text-[0.8125rem]', value ? 'border-control bg-surface text-ink' : 'border-dashed border-control text-glaze')}>
      {value ? `${label}: ${options.find((o) => o[0] === value)?.[1].replace(/ \(\d+\)$/, '') ?? value}` : `+ ${label}`}
      <select aria-label={label} value={value ?? ''} onChange={(e) => onChange(e.target.value || undefined)} className="absolute inset-0 cursor-pointer opacity-0">
        <option value="">Any {label.toLowerCase()}</option>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  )
}

function EmptyArchive() {
  return (
    <main className="grid flex-1 place-content-center gap-4 px-6 py-24 text-center">
      <h1 className="text-[1.75rem] leading-9">The archive is empty</h1>
      <p className="mx-auto max-w-md text-ink-2">No snapshot of the registry has been collected yet. An operator runs Collect, which brings in the Startup Tunisia registry in about a minute.</p>
      <div>
        <Button asChild className="h-10 rounded-[4px] px-4">
          <Link to="/portal/runs" className="text-glaze-ink no-underline">
            Open the operator portal
          </Link>
        </Button>
      </div>
    </main>
  )
}
