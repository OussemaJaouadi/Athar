import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Search } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { Desk, DeskBar, DeskEmpty, DeskGroup, DeskItem, Kbd, deskInput, useDeskKeys } from '@/components/athar/desk'
import { TracePane } from '@/components/athar/trace-pane'
import { day, plural } from '@/components/athar/trace-parts'
import { cn } from '@/lib/utils'
import { findTraceStartups, getTraceStartup } from '#/server/api/trace'

type SearchParams = { q?: string; startup?: string }

export const Route = createFileRoute('/portal/trace/')({
  validateSearch: (s: Record<string, unknown>): SearchParams => ({
    q: typeof s.q === 'string' && s.q.trim() ? s.q : undefined,
    startup: typeof s.startup === 'string' && s.startup ? s.startup : undefined,
  }),
  loaderDeps: ({ search }) => ({ q: search.q ?? '', startup: search.startup }),
  // The selected startup, or the first in the list: the pane is never empty unless the list is.
  loader: async ({ deps }) => {
    const list = await findTraceStartups({ data: deps.q })
    const id = deps.startup ?? list.groups[0]?.hits[0]?.id
    const trace = id ? await getTraceStartup({ data: id }) : null
    return { list, id, trace }
  },
  component: TracePage,
})

function TracePage() {
  const { list, id, trace } = Route.useLoaderData()
  const search = Route.useSearch()
  const navigate = useNavigate({ from: '/portal/trace/' })
  const searchRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState(search.q ?? '')

  // Search as you type; the URL keeps the query.
  useEffect(() => {
    if (query === (search.q ?? '')) return
    const t = setTimeout(() => navigate({ search: (s) => ({ ...s, q: query.trim() || undefined, startup: undefined }), replace: true }), 220)
    return () => clearTimeout(t)
  }, [query, search.q, navigate])

  const select = useCallback((startup: string) => navigate({ search: (s) => ({ ...s, startup }) }), [navigate])
  // A startup can sit in two groups (listed twice, and in All); keyboard stepping visits each once.
  const ids = useMemo(() => [...new Set(list.groups.flatMap((g) => g.hits.map((h) => h.id)))], [list])
  useDeskKeys({ ids, current: id, select, search: searchRef })

  const shown = list.groups.reduce((t, g) => t + g.hits.length, 0)
  const facts = list.query ? `${shown < list.total ? `${shown} of ` : ''}${plural(list.total, 'match', 'matches')}` : plural(list.startups, 'startup')

  const listView = (
    <div>
      {list.groups.length === 0 && (
        <p className="px-4 py-6 text-[0.875rem] text-ink">{list.query ? `No startup matches “${list.query}”.` : 'Nothing collected yet. Run Collect on the Pipeline page.'}</p>
      )}
      {list.groups.map((g) => (
        <div key={g.key}>
          {(!list.query || list.groups.length > 1) && <DeskGroup label={g.label} count={g.total} />}
          {g.hits.map((h) => (
            <DeskItem
              key={`${g.key}-${h.id}`}
              selected={h.id === id}
              onSelect={() => select(h.id)}
              title={h.name}
              qualifier={h.sector ?? 'no sector'}
              detail={[plural(h.entries, 'entry', 'entries'), `first seen ${day(h.firstSeen)}`, h.withdrawn ? 'no longer listed' : null].filter(Boolean).join(' · ')}
            />
          ))}
          {g.hits.length < g.total && (
            <p className="border-b border-hairline px-4 py-2 text-[0.8125rem] text-ink-2">
              {plural(g.total - g.hits.length, 'more startup', 'more startups')}. Search to narrow the list.
            </p>
          )}
        </div>
      ))}
    </div>
  )

  return (
    <main className="flex min-h-0 flex-1 flex-col">
      <DeskBar title="Trace" facts={facts}>
        <label className="relative flex items-center">
          <span className="sr-only">Search startups by name or id</span>
          <Search className="pointer-events-none absolute start-2.5 size-4 text-ink-2" aria-hidden />
          <input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                const first = list.groups[0]?.hits[0]
                if (first) select(first.id)
              }
            }}
            placeholder="Startup name or id"
            className={cn(deskInput, 'w-72 ps-8')}
          />
          <span className="pointer-events-none absolute end-2 hidden sm:inline">
            <Kbd>/</Kbd>
          </span>
        </label>
      </DeskBar>
      <Desk
        storageKey="trace"
        showPaneOnNarrow={!!search.startup}
        onBack={() => navigate({ search: (s) => ({ ...s, startup: undefined }) })}
        backLabel="All startups"
        list={listView}
        pane={trace ? <TracePane key={trace.id} data={trace} /> : <DeskEmpty>{id ? 'No startup with this id.' : 'Pick a startup.'}</DeskEmpty>}
      />
    </main>
  )
}
