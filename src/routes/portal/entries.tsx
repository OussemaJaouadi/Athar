import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { CircleCheck, CircleDashed, Clock, Search } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { Desk, DeskBar, DeskEmpty, DeskItem, DeskPane, Evidence, Kbd, PaneSection, JsonBlock, deskInput, useDeskKeys } from '@/components/athar/desk'
import { day, plural } from '@/components/athar/trace-parts'
import { cn } from '@/lib/utils'
import { getEntry, getLeadEntry, searchEntries } from '#/server/api/ops'
import type { EntryView } from '#/server/pipeline/state'

type SearchParams = { q?: string; entry?: string; startup?: string }

export const Route = createFileRoute('/portal/entries')({
  validateSearch: (s: Record<string, unknown>): SearchParams => ({
    q: typeof s.q === 'string' && s.q.trim() ? s.q : undefined,
    entry: typeof s.entry === 'string' && s.entry ? s.entry : undefined,
    startup: typeof s.startup === 'string' && s.startup ? s.startup : undefined,
  }),
  loaderDeps: ({ search }) => ({ q: search.q ?? '', entry: search.entry, startup: search.startup }),
  // A startup slug (from older links and the startup pages) opens that startup's lead entry (getLeadEntry); the
  // startup's name then fills the list so its other entries are one click away.
  loader: async ({ deps }) => {
    const lead = deps.startup && !deps.entry ? await getLeadEntry({ data: deps.startup }) : null
    const query = deps.q || (lead ? deps.startup! : '')
    const hits = query ? await searchEntries({ data: query }) : []
    const id = deps.entry ?? lead ?? (deps.q ? hits[0]?.id : undefined)
    const view = id ? await getEntry({ data: id }) : null
    return { hits, id, view }
  },
  component: EntriesPage,
})

function EntriesPage() {
  const { hits, id, view } = Route.useLoaderData()
  const search = Route.useSearch()
  const navigate = useNavigate({ from: '/portal/entries' })
  const searchRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState(search.q ?? '')

  // Search as you type; the URL keeps the query.
  useEffect(() => {
    if (query === (search.q ?? '')) return
    const t = setTimeout(() => navigate({ search: (s) => ({ ...s, q: query.trim() || undefined, entry: undefined, startup: undefined }), replace: true }), 220)
    return () => clearTimeout(t)
  }, [query, search.q, navigate])

  const select = useCallback((entry: string) => navigate({ search: (s) => ({ ...s, entry, startup: undefined }) }), [navigate])
  const ids = useMemo(() => hits.map((h) => h.id), [hits])
  useDeskKeys({ ids, current: id, select, search: searchRef })

  const listView = (
    <div>
      {hits.length === 0 ? (
        <p className="px-4 py-6 text-[0.875rem] text-ink">
          {search.q ? `No entry matches “${search.q}”.` : 'Type an entry id (the first characters are enough), a startup name, a founder or a website.'}
        </p>
      ) : (
        hits.map((h) => (
          <DeskItem
            key={h.id}
            selected={h.id === id}
            onSelect={() => select(h.id)}
            title={h.name}
            qualifier={`entry ${h.id.slice(0, 8)}`}
            detail={[h.startupName ? `startup ${h.startupName}` : 'no startup', `seen ${day(h.firstSeen)}–${day(h.lastSeen)}`, h.published ? null : 'not published'].filter(Boolean).join(' · ')}
          />
        ))
      )}
    </div>
  )

  return (
    <main className="flex min-h-0 flex-1 flex-col">
      <DeskBar title="Entries" facts={search.q ? plural(hits.length, 'match', 'matches') + (hits.length === 30 ? ' (first 30)' : '') : undefined}>
        <label className="relative flex items-center">
          <span className="sr-only">Search entries by id, name, founder or website</span>
          <Search className="pointer-events-none absolute start-2.5 size-4 text-ink-2" aria-hidden />
          <input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && hits[0]) select(hits[0].id)
            }}
            placeholder="Entry id, name, founder or website"
            className={cn(deskInput, 'w-80 ps-8')}
          />
          <span className="pointer-events-none absolute end-2 hidden sm:inline">
            <Kbd>/</Kbd>
          </span>
        </label>
      </DeskBar>
      <Desk
        storageKey="entries"
        showPaneOnNarrow={!!search.entry}
        onBack={() => navigate({ search: (s) => ({ ...s, entry: undefined }) })}
        backLabel="All entries"
        list={listView}
        pane={view ? <EntryPane key={view.id} v={view} /> : <DeskEmpty>{id ? 'No entry with this id.' : 'Search for an entry to see how it was read.'}</DeskEmpty>}
      />
    </main>
  )
}

/** An observation or a computed value is current, out of date, or absent: the same icon-plus-word as Pipeline. */
function StateWord({ state }: { state: 'current' | 'stale' | 'none' }) {
  const { Icon, word } = state === 'current' ? { Icon: CircleCheck, word: 'Up to date' } : state === 'stale' ? { Icon: Clock, word: 'Stale' } : { Icon: CircleDashed, word: 'None' }
  return (
    <span className="inline-flex items-center gap-1.5 text-[0.875rem] text-ink">
      <Icon className="size-4 shrink-0" aria-hidden />
      {word}
    </span>
  )
}

function Line({ label, state, children }: { label: string; state: 'current' | 'stale' | 'none'; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[150px_120px_minmax(0,1fr)] items-baseline gap-x-3 border-b border-hairline py-[7px]">
      <span className="text-[0.8125rem] text-ink-2">{label}</span>
      <StateWord state={state} />
      <span className="text-[0.875rem] [overflow-wrap:anywhere] text-ink">{children}</span>
    </div>
  )
}

function EntryPane({ v }: { v: EntryView }) {
  const d = v.downstream
  return (
    <DeskPane
      title={<span className="font-mono text-[1.125rem] font-normal">{v.id}</span>}
      statement={v.startup ? v.startup.name : 'No startup'}
      position={`seen ${day(v.firstSeen)} to ${day(v.lastSeen)}${v.published ? '' : ' · not in the newest download'}${v.copies > 1 ? ` · published ${v.copies}×` : ''}`}
    >
      <PaneSection title="As published">
        <JsonBlock value={v.row} title={`entry ${v.id}`} />
      </PaneSection>

      <PaneSection title="How it was read">
        {v.changes.length === 0 ? (
          <p className="text-[0.875rem] text-ink">Read as published.</p>
        ) : (
          <Evidence headers={['Field', 'Published', 'Read as', 'Why']} rows={v.changes.map((c) => ({ field: c.field, wrote: c.from, cleaning: c.to ?? 'Left empty', why: c.why }))} />
        )}
        {v.notes.length > 0 && (
          <ul className="mt-3 grid gap-1">
            {v.notes.map((n) => (
              <li key={n.code} className="text-[0.875rem] text-ink">
                {n.text}
              </li>
            ))}
          </ul>
        )}
      </PaneSection>

      {v.startup && (
        <PaneSection title="Why it belongs to this startup">
          {v.siblings.length === 0 ? (
            <p className="text-[0.875rem] text-ink">
              The only entry of {v.startup.name}
              {v.lead ? '; the startup is read from it' : ''}.
            </p>
          ) : (
            <>
              <p className="mb-2 text-[0.875rem] text-ink">
                {v.startup.name} has {plural(v.siblings.length + 1, 'entry', 'entries')}
                {v.lead ? '; its values are read from this one' : ''}.
              </p>
              <ul className="border-t border-edge">
                {v.siblings.map((s) => (
                  <li key={s.id} className="grid gap-1 border-b border-hairline py-2.5">
                    <p className="text-[0.875rem]">
                      <Link to="/portal/entries" search={{ entry: s.id }} className="font-mono text-glaze underline">
                        entry {s.id}
                      </Link>
                      <span className="text-ink-2">
                        {' '}
                        · seen {day(s.firstSeen)}–{day(s.lastSeen)}
                        {s.lead ? ' · the startup is read from it' : ''}
                        {s.published ? '' : ' · not published'}
                      </span>
                    </p>
                    {s.bonds.map((b) => (
                      <p key={b.kind + b.text} className="text-[0.875rem] text-ink">
                        {b.text}
                      </p>
                    ))}
                    {s.differences.length === 0 ? (
                      <p className="text-[0.875rem] text-ink-2">Says the same as this one.</p>
                    ) : (
                      <dl className="grid grid-cols-[150px_minmax(0,1fr)_minmax(0,1fr)] gap-x-3 text-[0.875rem]">
                        <dt className="text-[0.8125rem] text-ink-2">Differs on</dt>
                        <dd className="text-[0.8125rem] text-ink-2">This entry</dd>
                        <dd className="text-[0.8125rem] text-ink-2">That entry</dd>
                        {s.differences.map((x) => (
                          <div key={x.field} className="contents">
                            <dt className="text-ink">{x.field}</dt>
                            <dd className="[overflow-wrap:anywhere] text-ink">{x.here ?? <span className="text-ink-3">empty</span>}</dd>
                            <dd className="[overflow-wrap:anywhere] text-ink">{x.there ?? <span className="text-ink-3">empty</span>}</dd>
                          </div>
                        ))}
                      </dl>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
          {v.namesakes.length > 0 && (
            <div className="mt-4">
              <h4 className="mb-1.5 font-sans text-[0.8125rem] font-medium text-ink-2">Same name, different company</h4>
              <ul className="border-t border-edge">
                {v.namesakes.map((n) => (
                  <li key={n.id} className="border-b border-hairline py-2 text-[0.875rem] text-ink">
                    <Link to="/startups/$id" params={{ id: n.id }} className="text-glaze underline">
                      {n.name}
                    </Link>
                    : {n.why}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </PaneSection>
      )}

      {d && (
        <PaneSection title="What Athar observed and computed">
          <div className="border-t border-edge">
            <Line label="Website check" state={d.check ? 'current' : 'none'}>
              {d.check
                ? `${d.check.status === 'reachable' ? 'Answers' : `Does not answer since ${day(d.check.since)}`} (${d.check.detail})${d.check.finalHost ? `, now from ${d.check.finalHost}` : ''} · asked ${day(d.check.checkedAt)}`
                : 'Not asked: no website of its own, or not checked yet'}
            </Line>
            <Line label="Prepared text" state={d.prepared ? (d.prepared.current ? 'current' : 'stale') : 'none'}>
              {d.prepared ? `${d.prepared.model ?? 'model unknown'} · ${day(d.prepared.at)}` : 'Not prepared'}
            </Line>
            <Line label="Vector" state={d.vector ? (d.vector.current ? 'current' : 'stale') : 'none'}>
              {d.vector ? `${d.vector.model} (${d.vector.revision}) · from the ${d.vector.from} · ${day(d.vector.at)}` : 'Not embedded'}
            </Line>
          </div>
        </PaneSection>
      )}

      {v.startup && (
        <p>
          <Link to="/startups/$id" params={{ id: v.startup.id }} className="text-[0.875rem] text-glaze underline">
            Open the startup page
          </Link>
        </p>
      )}
    </DeskPane>
  )
}
