import { Link, createFileRoute, useNavigate, useRouter } from '@tanstack/react-router'
import { ArrowDown, ArrowUp, ExternalLink, LoaderCircle, Search } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

import { OpsDrawer, OpsPage, opsGhost, opsRow, opsTd, opsTh, useListStepper } from '@/components/athar/ops'
import { TraceBody, type TraceData } from '@/components/athar/trace-drawer'
import { RowJump } from '@/components/athar/trace-parts'
import { cn } from '@/lib/utils'
import { findTraceRows, getTraceRow } from '#/server/api/trace'

type SearchParams = { q?: string; row?: string }

export const Route = createFileRoute('/portal/trace/')({
  validateSearch: (s: Record<string, unknown>): SearchParams => ({
    q: typeof s.q === 'string' && s.q.trim() ? s.q : undefined,
    row: typeof s.row === 'string' && s.row ? s.row : undefined,
  }),
  // The open row is not a loader dependency: opening the drawer never refetches the list.
  loaderDeps: ({ search }) => ({ q: search.q ?? '' }),
  loader: ({ deps }) => findTraceRows({ data: deps.q }),
  component: TracePicker,
})

const n = (v: number) => v.toLocaleString('en-GB')

/** The row in the drawer: fetched on demand, the previous one kept on screen until the next arrives. */
function useTraceRow(rowId: string | undefined) {
  const [data, setData] = useState<TraceData | null>(null)
  const [missing, setMissing] = useState(false)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (!rowId) return
    let live = true
    getTraceRow({ data: rowId })
      .then((d) => {
        if (!live) return
        setMissing(!d)
        if (d) setData(d)
      })
      .catch(() => live && setMissing(true))
    return () => {
      live = false
    }
  }, [rowId, tick])
  const reload = useCallback(() => setTick((t) => t + 1), [])
  return { data, loading: !!rowId && data?.row.id !== rowId && !missing, missing, reload }
}

function TracePicker() {
  const { hits, total, snapshotRows } = Route.useLoaderData()
  const { q = '', row } = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const router = useRouter()
  const [draft, setDraft] = useState(q)
  const typed = useRef(false)

  // Search as you type: the URL follows the field after a short pause, so results are shareable and Back works.
  useEffect(() => {
    if (!typed.current) return
    const t = setTimeout(() => navigate({ search: (s) => ({ ...s, q: draft.trim() || undefined }), replace: true }), 220)
    return () => clearTimeout(t)
  }, [draft, navigate])
  const pending = draft.trim() !== q.trim()
  const exact = /^\d+$/.test(q.trim()) ? hits.find((h) => h.row_number === Number(q.trim())) : undefined

  const open = useCallback((id: string | undefined) => navigate({ search: (s) => ({ ...s, row: id }), replace: true }), [navigate])
  const trace = useTraceRow(row)
  const ids = hits.map((h) => h.id)
  useListStepper(ids, row, open)

  // Keep the open row in view while stepping with J/K.
  useEffect(() => {
    if (!row) return
    document.querySelector(`[data-row-id="${row}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [row])

  const d = trace.data
  const name = d ? d.record?.name || d.rawFields.find(([k]) => k === 'name')?.[1] || 'Unnamed row' : 'Loading…'

  return (
    <OpsPage title="Trace" lede={`Follow any of the ${n(snapshotRows)} registry rows from download to startup.`}>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <label className="flex h-8 w-full max-w-[26rem] items-center gap-2 rounded-md border border-edge bg-canvas px-2.5 focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-glaze">
          <span className="sr-only">Row number or startup name</span>
          {pending ? (
            <LoaderCircle className="size-3.5 shrink-0 animate-spin text-ink-2 motion-reduce:animate-none" aria-hidden />
          ) : (
            <Search className="size-3.5 shrink-0 text-ink-2" aria-hidden />
          )}
          <input
            type="search"
            autoComplete="off"
            value={draft}
            placeholder="Row number or startup name"
            onChange={(e) => {
              typed.current = true
              setDraft(e.target.value)
            }}
            onKeyDown={(e) => {
              const target = exact ?? (hits.length === 1 ? hits[0] : undefined)
              if (e.key === 'Enter' && target && !pending) open(target.id)
            }}
            className="h-full min-w-0 flex-1 bg-transparent text-[0.8125rem] text-ink outline-none placeholder:text-ink-2"
          />
        </label>
        <RowJump last={snapshotRows} onOpen={open} />
        <p className="ms-auto text-[0.8125rem] text-ink-2" aria-live="polite">
          {q
            ? total === 0
              ? `No row matches “${q}”`
              : `${hits.length < total ? `${n(hits.length)} of ${n(total)}` : n(total)} ${total === 1 ? 'match' : 'matches'}`
            : `Open findings first · ${n(hits.length)} of ${n(total)} rows`}
        </p>
      </div>

      {hits.length > 0 ? (
        <div className="overflow-x-auto rounded-md border border-edge">
          <table className="w-full min-w-[40rem]">
            <thead className="bg-surface">
              <tr>
                <th scope="col" className={cn(opsTh, 'w-24')}>
                  Row
                </th>
                <th scope="col" className={opsTh}>
                  Startup
                </th>
                <th scope="col" className={opsTh}>
                  Sector
                </th>
                <th scope="col" className={cn(opsTh, 'w-36')}>
                  Cleaning
                </th>
                <th scope="col" className={cn(opsTh, 'w-32')}>
                  Findings
                </th>
              </tr>
            </thead>
            <tbody>
              {hits.map((h) => {
                const active = h.id === row
                return (
                  <tr
                    key={h.id}
                    data-row-id={h.id}
                    aria-selected={active}
                    onClick={() => open(h.id)}
                    className={cn(opsRow, 'cursor-pointer hover:bg-surface', active && 'bg-surface-raised hover:bg-surface-raised')}
                  >
                    <td className={cn(opsTd, 'tabular-nums')}>
                      {h.row_number}
                      {exact?.id === h.id && <span className="ms-2 text-ink-2">exact</span>}
                    </td>
                    <td className={cn(opsTd, 'max-w-0 truncate')}>
                      <button type="button" onClick={(e) => (e.stopPropagation(), open(h.id))} className="max-w-full truncate text-start font-medium text-ink hover:underline">
                        {h.name}
                      </button>
                    </td>
                    <td className={cn(opsTd, 'max-w-0 truncate')}>{h.sector ?? '—'}</td>
                    <td className={cn(opsTd, 'tabular-nums')}>{h.changes ? `${h.changes} ${h.changes === 1 ? 'field' : 'fields'}` : '—'}</td>
                    <td className={cn(opsTd, 'tabular-nums')}>{h.open ? <span className="border-s-2 border-ochre ps-2">{h.open} open</span> : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-[0.875rem] text-ink">Nothing matches. Try part of the name, or the row number from the registry file.</p>
      )}

      <OpsDrawer
        open={!!row}
        onOpenChange={(v) => !v && open(undefined)}
        storageKey="trace"
        defaultWidth={640}
        itemKey={d?.row.id}
        eyebrow={trace.loading ? 'Loading…' : d ? `Row ${d.row.row_number} of ${n(d.lastRow)}` : trace.missing ? 'Not found' : 'Row'}
        title={trace.missing ? 'This row does not exist' : name}
        actions={
          d && (
            <>
              <button
                type="button"
                disabled={!d.prev}
                onClick={() => d.prev && open(d.prev.id)}
                aria-label={d.prev ? `Previous: row ${d.prev.row_number}` : 'First row'}
                className={cn(opsGhost, 'w-8 px-0')}
              >
                <ArrowUp aria-hidden />
              </button>
              <button
                type="button"
                disabled={!d.next}
                onClick={() => d.next && open(d.next.id)}
                aria-label={d.next ? `Next: row ${d.next.row_number}` : 'Last row'}
                className={cn(opsGhost, 'w-8 px-0')}
              >
                <ArrowDown aria-hidden />
              </button>
              {d.startup && (
                <Link to="/startups/$id" params={{ id: d.startup.id }} className={cn(opsGhost, 'no-underline')}>
                  <ExternalLink aria-hidden />
                  Open profile
                </Link>
              )}
            </>
          )
        }
      >
        {trace.missing ? (
          <p className="text-[0.875rem] text-ink">No source row has this id. It may belong to a snapshot that was replaced.</p>
        ) : d ? (
          <div aria-busy={trace.loading}>
            <TraceBody
              data={d}
              onOpen={open}
              onChanged={() => {
                trace.reload()
                router.invalidate()
              }}
            />
          </div>
        ) : (
          <p className="text-[0.875rem] text-ink-2">Loading the row…</p>
        )}
      </OpsDrawer>
    </OpsPage>
  )
}
