import { Link, createFileRoute, getRouteApi, useNavigate } from '@tanstack/react-router'
import { ArrowUpRight, Sparkles, X } from 'lucide-react'
import { useMemo, useState } from 'react'

import { ChainStrip, Panel, RecordLine, SampleTag, Score, catalogueNo, labelledYear, shortDate } from '@/components/athar/kit'
import { SectorWall } from '@/components/athar/tile-wall'
import { Mark, MarkerText } from '@/components/kokonutui/marker-text'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { getStartup, searchStartups, type SearchInput } from '#/server/api/app'
import { getProfileSample } from '#/server/api/sample'

type Search = SearchInput & { open?: string }

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v : undefined)
const num = (v: unknown) => (typeof v === 'number' && v > 0 ? v : typeof v === 'string' && /^\d{4}$/.test(v) ? Number(v) : undefined)

export const Route = createFileRoute('/_app/search')({
  validateSearch: (s: Record<string, unknown>): Search => ({
    q: str(s.q),
    ask: str(s.ask),
    sector: str(s.sector),
    from: num(s.from),
    to: num(s.to),
    flag: s.flag === 'no-description' || s.flag === 'website' || s.flag === 'no-website' ? s.flag : undefined,
    open: str(s.open),
  }),
  loaderDeps: ({ search }) => search,
  loader: async ({ deps: { open, ...filters } }) => {
    const [results, preview] = await Promise.all([
      searchStartups({ data: filters }),
      open ? Promise.all([getStartup({ data: open }), getProfileSample({ data: open })]) : Promise.resolve(null),
    ])
    return { results, preview }
  },
  component: ArchivePage,
})

const FLAGS = [
  { id: 'website', label: 'Has a website' },
  { id: 'no-website', label: 'No website' },
  { id: 'no-description', label: 'No description' },
] as const

// The archive: the wall filters by sector; search narrows; a record opens beside the list.
function ArchivePage() {
  const { results, preview } = Route.useLoaderData()
  const { wall } = shell.useLoaderData()
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const { rows, matched, years, total, read } = results
  const narrowing = Boolean(search.q || search.ask || search.from || search.to || search.flag)
  const marked = useMemo(() => (narrowing ? new Set(rows.map((r) => r.id)) : undefined), [narrowing, rows])
  const [mode, setMode] = useState<'words' | 'ask'>(search.ask ? 'ask' : 'words')
  const set = (patch: Partial<Search>) => navigate({ search: (prev) => ({ ...prev, ...patch, open: undefined }), resetScroll: false })

  if (total === 0) return <EmptyArchive />

  const active = [
    search.sector && { k: 'sector', label: search.sector },
    search.q && { k: 'q', label: `“${search.q}”` },
    search.ask && { k: 'ask', label: `asked: ${search.ask}` },
    (search.from || search.to) && { k: 'years', label: search.from === search.to ? `labelled ${search.from}` : `labelled ${search.from ?? '…'}–${search.to ?? '…'}` },
    search.flag && { k: 'flag', label: FLAGS.find((f) => f.id === search.flag)?.label },
  ].filter(Boolean) as { k: string; label: string }[]

  return (
    <main className="grid grid-cols-[minmax(0,1fr)] gap-4 px-4 py-5 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="grid gap-0.5">
          <p className="font-mono text-[0.6875rem] tracking-wide text-ink-2 uppercase">The archive</p>
          <h1 className="text-2xl font-semibold">Every labelled Tunisian startup, with its record</h1>
        </div>
        <form
          className="flex w-full max-w-2xl min-w-0 items-stretch border border-control bg-canvas focus-within:outline-2 focus-within:outline-glaze"
          onSubmit={(e) => {
            e.preventDefault()
            const value = String(new FormData(e.currentTarget).get('text') ?? '').trim() || undefined
            set(mode === 'ask' ? { ask: value, q: undefined, sector: undefined, from: undefined, to: undefined, flag: undefined } : { q: value, ask: undefined })
          }}
        >
          <div role="radiogroup" aria-label="Search mode" className="flex shrink-0 border-e border-hairline p-1">
            {(['words', 'ask'] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={mode === m}
                onClick={() => setMode(m)}
                className={cn('flex items-center gap-1 rounded-sm px-2 text-xs', mode === m ? 'bg-surface-raised text-ink' : 'text-ink-2 hover:text-ink')}
              >
                {m === 'ask' && <Sparkles className="size-3" aria-hidden />}
                {m === 'words' ? 'Words' : 'In your words'}
              </button>
            ))}
          </div>
          <input
            key={mode}
            name="text"
            defaultValue={mode === 'ask' ? search.ask : search.q}
            aria-label="Search the archive"
            placeholder={mode === 'ask' ? 'fintech startups labelled after 2021 without a website' : 'A name, a word: olive, payment, tutoring'}
            className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm outline-none"
          />
          <Button type="submit" className="m-1 h-auto rounded-sm px-4">
            Search
          </Button>
        </form>
      </div>

      <SectorWall tiles={wall} marked={marked} active={search.sector} />

      <div className="grid items-start gap-4 lg:grid-cols-[13rem_minmax(0,1fr)] xl:grid-cols-[13rem_minmax(0,1fr)_minmax(0,28rem)]">
        <aside aria-label="Filters" className="grid gap-5 lg:sticky lg:top-16">
          <FilterGroup title="Labelled">
            <div className="flex flex-wrap gap-1">
              {years.map((y) => {
                const on = search.from === y.year && search.to === y.year
                return (
                  <button
                    key={y.year}
                    type="button"
                    onClick={() => set(on ? { from: undefined, to: undefined } : { from: y.year, to: y.year })}
                    className={cn('grid min-w-14 flex-1 rounded-sm border px-1.5 py-1 text-start', on ? 'border-ink bg-surface-raised' : 'border-hairline hover:bg-surface')}
                  >
                    <span className="font-mono text-xs">{y.year}</span>
                    <span className="font-mono text-[0.625rem] text-ink-2">{y.count}</span>
                  </button>
                )
              })}
            </div>
          </FilterGroup>
          <FilterGroup title="Evidence">
            <div className="grid gap-0.5">
              {FLAGS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => set({ flag: search.flag === f.id ? undefined : f.id })}
                  className={cn('flex items-center gap-2 rounded-sm px-2 py-1.5 text-start text-sm', search.flag === f.id ? 'bg-surface-raised text-ink' : 'text-ink-2 hover:bg-surface hover:text-ink')}
                >
                  <span aria-hidden className={cn('size-2.5', f.id === 'no-description' ? 'outline outline-1 -outline-offset-1 outline-dashed outline-zinc-400' : f.id === 'no-website' ? 'bg-zinc-400' : 'bg-zinc-800')} />
                  {f.label}
                </button>
              ))}
            </div>
          </FilterGroup>
          <FilterGroup title="Reading the wall">
            <ul className="grid gap-1.5 text-xs text-ink-2">
              <li className="flex items-center gap-2"><span className="size-2 bg-zinc-900" />labelled early (2019)</li>
              <li className="flex items-center gap-2"><span className="size-2 bg-zinc-400" />labelled recently (2025)</li>
              <li className="flex items-center gap-2"><span className="size-2 outline outline-1 -outline-offset-1 outline-dashed outline-zinc-400" />no description</li>
              <li className="flex items-center gap-2"><span className="size-2 bg-ochre" />matches your search</li>
            </ul>
          </FilterGroup>
        </aside>

        <Panel
          title={`${matched} of ${total} records`}
          meta={
            active.length > 0 && (
              <button type="button" onClick={() => navigate({ search: {} })} className="text-xs text-ink-2 hover:text-ink">
                Clear all
              </button>
            )
          }
          bodyClassName="p-0"
        >
          {(active.length > 0 || read) && (
            <div className="flex flex-wrap items-center gap-1.5 border-b border-hairline px-3 py-2">
              {read && (
                <span className="me-1 flex items-center gap-1.5 text-xs text-ink-2">
                  <SampleTag /> read as
                </span>
              )}
              {read
                ? read.read.map((r) => (
                    <span key={r} className="rounded-sm bg-surface px-1.5 py-0.5 font-mono text-[0.6875rem]">
                      {r}
                    </span>
                  ))
                : active.map((a) => (
                    <button
                      key={a.k}
                      type="button"
                      onClick={() => set(a.k === 'years' ? { from: undefined, to: undefined } : { [a.k]: undefined })}
                      className="flex items-center gap-1 rounded-sm bg-surface px-1.5 py-0.5 text-xs hover:bg-surface-raised"
                    >
                      {a.label} <X className="size-3" aria-label="Remove filter" />
                    </button>
                  ))}
            </div>
          )}
          {rows.length === 0 ? (
            <div className="grid gap-2 px-4 py-10 text-center">
              <MarkerText as="p" className="font-display text-lg">
                <Mark type="circle" color="var(--ochre)">No record</Mark> matches.
              </MarkerText>
              <p className="text-sm text-ink-2">The archive only holds what the registry published. Try fewer words, or check the idea instead.</p>
              <div>
                <Link to="/idea" className="text-sm">Check this as an idea →</Link>
              </div>
            </div>
          ) : (
            <ol className="divide-y divide-hairline">
              {rows.map((s) => (
                <li key={s.id}>
                  <div className="hidden xl:block">
                    <RecordLine {...s} to="preview" active={s.id === search.open} />
                  </div>
                  <div className="xl:hidden">
                    <RecordLine {...s} />
                  </div>
                </li>
              ))}
            </ol>
          )}
          {matched > rows.length && <p className="border-t border-hairline px-4 py-3 text-xs text-ink-2">Showing the first {rows.length}. Narrow by sector or year to see the rest.</p>}
        </Panel>

        <div className="hidden xl:sticky xl:top-16 xl:block">
          {preview?.[0] ? <RecordPreview record={preview[0]} sample={preview[1]} /> : <PreviewHint />}
        </div>
      </div>
    </main>
  )
}

const shell = getRouteApi('/_app')

function FilterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-2">
      <h2 className="font-mono text-[0.625rem] tracking-wide text-ink-2 uppercase">{title}</h2>
      {children}
    </section>
  )
}

function PreviewHint() {
  return (
    <div className="grid min-h-80 content-center gap-2 border border-dashed border-hairline p-8 text-center">
      <p className="font-display text-lg">Choose a record</p>
      <p className="text-sm text-ink-2">It opens here with the chain behind every line, so you can keep your place in the list.</p>
    </div>
  )
}

type RecordData = NonNullable<Awaited<ReturnType<typeof getStartup>>>
type ProfileSample = Awaited<ReturnType<typeof getProfileSample>>

function RecordPreview({ record, sample }: { record: RecordData; sample: ProfileSample }) {
  const { startup, chain } = record
  const fields: [string, string, React.ReactNode][] = [
    ['What it does', 'description', startup.description],
    ['Website', 'website', startup.website?.replace(/^https?:\/\//, '')],
    ['Founders', 'founders', startup.founders.join(', ') || null],
    ['Founded', 'creation_year', startup.creation_year],
  ]
  return (
    <article className="grid border border-hairline bg-canvas">
      <header className="grid gap-1 border-b border-hairline p-4">
        <div className="flex items-center justify-between gap-2 font-mono text-[0.6875rem] text-ink-2">
          <span>
            {catalogueNo(startup.id)} · {startup.sector} · labelled {labelledYear(startup.cohort)}
          </span>
          <Link to="/search" search={(p: Record<string, unknown>) => ({ ...p, open: undefined })} resetScroll={false} aria-label="Close preview" className="text-ink-2 hover:text-ink">
            <X className="size-4" />
          </Link>
        </div>
        <h2 className="text-xl font-semibold">{startup.name}</h2>
      </header>
      <MarkerText as="dl" className="grid divide-y divide-hairline">
        {fields.map(([label, key, value]) => (
          <div key={key} className="grid gap-1.5 px-4 py-3">
            <dt className="text-xs text-ink-2">{label}</dt>
            <dd className="m-0 text-sm">
              {value === null || value === undefined || value === '' ? (
                <Mark type="circle" color="var(--ochre)">
                  <span className="text-ink-2">The registry doesn&apos;t say</span>
                </Mark>
              ) : (
                value
              )}
            </dd>
            <ChainStrip chain={chain} field={key} />
          </div>
        ))}
      </MarkerText>
      {sample && (
        <div className="grid gap-2 border-t border-hairline p-4">
          <div className="flex items-center gap-2">
            <h3 className="font-mono text-[0.625rem] tracking-wide text-ink-2 uppercase">Closest in the archive</h3>
            <SampleTag />
          </div>
          <ul className="grid gap-1">
            {sample.similar.slice(0, 4).map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 text-sm">
                <Link to="/search" search={(p: Record<string, unknown>) => ({ ...p, open: s.id })} resetScroll={false} className="truncate">
                  {s.name}
                </Link>
                <Score value={s.score} />
              </li>
            ))}
          </ul>
        </div>
      )}
      <footer className="flex items-center justify-between gap-3 border-t border-hairline p-4">
        <span className="font-mono text-[0.6875rem] text-ink-2">{chain && `row ${chain.rowNumber} · collected ${shortDate(chain.fetchedAt)}`}</span>
        <Button asChild size="sm">
          <Link to="/startups/$id" params={{ id: startup.id }} className="no-underline">
            Open the full record <ArrowUpRight />
          </Link>
        </Button>
      </footer>
    </article>
  )
}

function EmptyArchive() {
  return (
    <main className="grid grid-cols-[minmax(0,1fr)] min-h-[70dvh] place-content-center gap-4 px-6 text-center">
      <div className="mx-auto flex gap-[3px]" aria-hidden>
        {Array.from({ length: 12 }, (_, i) => (
          <span key={i} className="size-3 outline outline-1 -outline-offset-1 outline-dashed outline-zinc-400" />
        ))}
      </div>
      <h1 className="text-2xl font-semibold">The wall is bare</h1>
      <p className="max-w-md text-ink-2">No registry has been collected yet. An operator runs Collect in the conservation lab; it takes about a minute and brings in the 921 rows of the Startup Tunisia registry.</p>
      <div>
        <Button asChild>
          <Link to="/portal/runs" className="no-underline">
            Open the lab
          </Link>
        </Button>
      </div>
    </main>
  )
}
