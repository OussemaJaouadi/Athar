import { createFileRoute, useNavigate, useRouter } from '@tanstack/react-router'
import { Search } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  Desk,
  DeskBar,
  DeskEmpty,
  DeskGroup,
  DeskItem,
  Kbd,
  deskBtn,
  deskInput,
  deskPrimary,
  useDeskKeys,
} from '@/components/athar/desk'
import { useLabToaster } from '@/components/athar/lab'
import { RowJump, plural } from '@/components/athar/trace-parts'
import { TracePane } from '@/components/athar/trace-pane'
import { cn } from '@/lib/utils'
import { decideReviews, restoreReviews, type ReviewStatus } from '#/server/api/review'
import { findTraceRows, getTraceRow } from '#/server/api/trace'

type SearchParams = { q?: string; row?: string }

export const Route = createFileRoute('/portal/trace/')({
  validateSearch: (s: Record<string, unknown>): SearchParams => ({
    q: typeof s.q === 'string' && s.q.trim() ? s.q : undefined,
    row: typeof s.row === 'string' && s.row ? s.row : undefined,
  }),
  loaderDeps: ({ search }) => ({ q: search.q ?? '', row: search.row }),
  // The selected row, or the first in the list: the pane is never empty unless the list is.
  loader: async ({ deps }) => {
    const list = await findTraceRows({ data: deps.q })
    const first = list.groups[0]?.rows[0]?.id
    const rowId = deps.row ?? first
    const trace = rowId ? await getTraceRow({ data: rowId }) : null
    return { list, rowId, trace }
  },
  component: TracePage,
})

function TracePage() {
  const { list, rowId, trace } = Route.useLoaderData()
  const search = Route.useSearch()
  const navigate = useNavigate({ from: '/portal/trace/' })
  const router = useRouter()
  const toaster = useLabToaster()
  const searchRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState(search.q ?? '')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const lastUndo = useRef<(() => Promise<void>) | null>(null)

  // Search as you type; the URL keeps the query.
  useEffect(() => {
    if (query === (search.q ?? '')) return
    const t = setTimeout(() => navigate({ search: (s) => ({ ...s, q: query.trim() || undefined, row: undefined }), replace: true }), 220)
    return () => clearTimeout(t)
  }, [query, search.q, navigate])

  useEffect(() => setNote(''), [rowId])

  const select = useCallback((id: string) => navigate({ search: (s) => ({ ...s, row: id }) }), [navigate])
  const ids = useMemo(() => list.groups.flatMap((g) => g.rows.map((r) => r.id)), [list])
  const open = trace?.findings.filter((f) => f.status === 'open') ?? []

  const decide = useCallback(
    (status: ReviewStatus) => {
      if (!open.length || busy) return
      const idsToDecide = open.map((f) => f.id)
      let previous: Awaited<ReturnType<typeof decideReviews>>['previous'] = []
      setBusy(true)
      const undo = async () => {
        await restoreReviews({ data: { previous } })
        await router.invalidate()
      }
      toaster.show(
        async () => {
          try {
            const r = await decideReviews({ data: { ids: idsToDecide, status, note: note || undefined } })
            previous = r.previous
            lastUndo.current = undo
            setNote('')
            await router.invalidate()
            return r.count
          } finally {
            setBusy(false)
          }
        },
        {
          loading: 'Saving the decision',
          success: (count: number) =>
            status === 'resolved' ? `${plural(count, 'finding')} fixed at source` : `${plural(count, 'finding')} kept as is`,
          error: (e) => ['Nothing was saved', e instanceof Error ? e.message : String(e)],
          undo: { run: undo, success: 'Decision undone' },
        },
      )
    },
    [open, busy, note, router, toaster],
  )

  const keys = useMemo(
    () =>
      open.length
        ? {
            e: () => decide('dismissed'),
            f: () => decide('resolved'),
            z: () => {
              const u = lastUndo.current
              lastUndo.current = null
              u?.()
            },
          }
        : undefined,
    [open.length, decide],
  )
  useDeskKeys({ ids, current: rowId, select, search: searchRef, keys })

  const shown = list.groups.reduce((t, g) => t + g.rows.length, 0)
  const facts = list.query ? `${shown < list.total ? `${shown} of ` : ''}${plural(list.total, 'match', 'matches')}` : plural(list.snapshotRows, 'row')

  const listView = (
    <div>
      {list.groups.length === 0 && <p className="px-4 py-6 text-[0.875rem] text-ink">{list.query ? `No row matches “${list.query}”.` : 'Nothing collected yet.'}</p>}
      {list.groups.map((g) => (
        <div key={g.key}>
          {(!list.query || list.groups.length > 1) && <DeskGroup label={g.label} count={g.total} />}
          {g.rows.map((h) => (
            <DeskItem
              key={h.id}
              selected={h.id === rowId}
              onSelect={() => select(h.id)}
              title={h.name}
              qualifier={`row ${h.row_number}`}
              detail={[h.sector ?? 'No sector', h.changes ? plural(h.changes, 'field') + ' changed' : 'nothing changed', h.open ? `${h.open} open` : null]
                .filter(Boolean)
                .join(' · ')}
            />
          ))}
          {g.rows.length < g.total && (
            <p className="border-b border-hairline px-4 py-2 text-[0.8125rem] text-ink-2">
              {g.total - g.rows.length} more. Search to narrow the list.
            </p>
          )}
        </div>
      ))}
    </div>
  )

  const foot = open.length ? (
    <>
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Note (optional)"
        aria-label="Note"
        className={cn(deskInput, 'min-w-40 flex-1')}
      />
      <button type="button" disabled={busy} onClick={() => decide('dismissed')} className={deskBtn}>
        Keep as is <Kbd>E</Kbd>
      </button>
      <button type="button" disabled={busy} onClick={() => decide('resolved')} className={deskPrimary}>
        Fixed at source <Kbd>F</Kbd>
      </button>
    </>
  ) : undefined

  return (
    <main className="flex min-h-0 flex-1 flex-col">
      <DeskBar title="Trace" facts={facts}>
        <label className="relative flex items-center">
          <span className="sr-only">Search rows by number or startup name</span>
          <Search className="pointer-events-none absolute start-2.5 size-4 text-ink-2" aria-hidden />
          <input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                const first = list.groups[0]?.rows[0]
                if (first) select(first.id)
              }
            }}
            placeholder="Row number or startup name"
            className={cn(deskInput, 'w-72 ps-8')}
          />
          <span className="pointer-events-none absolute end-2 hidden sm:inline">
            <Kbd>/</Kbd>
          </span>
        </label>
        <RowJump last={list.snapshotRows} onOpen={select} />
      </DeskBar>
      <Desk
        storageKey="trace"
        showPaneOnNarrow={!!search.row}
        onBack={() => navigate({ search: (s) => ({ ...s, row: undefined }) })}
        list={listView}
        pane={trace ? <TracePane key={trace.row.id} data={trace} foot={foot} /> : <DeskEmpty>{rowId ? 'This row is not in the registry.' : 'Pick a row.'}</DeskEmpty>}
      />
    </main>
  )
}
