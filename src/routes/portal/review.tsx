import { Link, createFileRoute, useNavigate, useRouter } from '@tanstack/react-router'
import { Archive, CircleCheck, ExternalLink, RotateCcw, Route as RouteIcon, Search, X } from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import { Fragment, useCallback, useMemo, useState } from 'react'

import { plural } from '@/components/athar/collect-button'
import { findingName, findingSentence, labTime, useLabToaster } from '@/components/athar/lab'
import {
  FieldList,
  OpsDrawer,
  OpsPage,
  opsButton,
  opsControl,
  opsGhost,
  opsPrimary,
  opsRow,
  opsTd,
  opsTh,
  useListStepper,
} from '@/components/athar/ops'
import { DuplicateList, evidenceFields, evidenceLine } from '@/components/athar/review-evidence'
import { useHoldToConfirm } from '@/components/interior/hold-to-confirm'
import { cn } from '@/lib/utils'
import { decideReviews, listReviewQueue, restoreReviews, type ReviewItem, type ReviewStatus } from '#/server/api/review'

type Search = { status?: ReviewStatus; code?: string; open?: string }

export const Route = createFileRoute('/portal/review')({
  validateSearch: (s: Record<string, unknown>): Search => ({
    status: s.status === 'resolved' || s.status === 'dismissed' || s.status === 'open' ? s.status : undefined,
    code: typeof s.code === 'string' && s.code ? s.code : undefined,
    open: typeof s.open === 'string' && s.open ? s.open : undefined,
  }),
  loaderDeps: ({ search }) => ({ status: search.status }),
  loader: ({ deps }) => listReviewQueue({ data: { status: deps.status } }),
  component: ReviewPage,
})

const STATUS_LABEL: Record<ReviewStatus, string> = { open: 'Open', resolved: 'Fixed at source', dismissed: 'Known gaps' }
const DONE: Record<Exclude<ReviewStatus, 'open'>, [string, string]> = {
  resolved: ['marked fixed at source', 'Fixed at source'],
  dismissed: ['kept as a known gap', 'Kept as a known gap'],
}

function ReviewPage() {
  const { items, counts, status } = Route.useLoaderData()
  const { code, open } = Route.useSearch()
  const navigate = useNavigate({ from: '/portal/review' })
  const router = useRouter()
  const toaster = useLabToaster()
  const [q, setQ] = useState('')
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [bulkNote, setBulkNote] = useState('')
  const [busy, setBusy] = useState(false)

  const total = (s: ReviewStatus, c?: string) => counts.filter((x) => x.status === s && (!c || x.code === c)).reduce((t, x) => t + x.count, 0)
  const codes = [...new Set(counts.filter((c) => c.status === status).map((c) => c.code))].sort((a, b) => total(status, b) - total(status, a))

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return items.filter(
      (i) => (!code || i.code === code) && (!needle || (i.name ?? '').toLowerCase().includes(needle) || String(i.row_number ?? '').startsWith(needle)),
    )
  }, [items, code, q])
  const groups = useMemo(
    () => [...new Set(shown.map((i) => i.code))].map((c) => ({ code: c, rows: shown.filter((i) => i.code === c) })),
    [shown],
  )
  // The list's reading order, group by group: what J/K and "next after a decision" walk through.
  const order = useMemo(() => groups.flatMap((g) => g.rows.map((r) => r.id)), [groups])
  const selected = shown.filter((i) => picked.has(i.id))
  const selectedCodes = [...new Set(selected.map((i) => i.code))]
  const current = items.find((i) => i.id === open)
  const records = new Set(items.filter((i) => i.status === 'open').map((i) => i.source_row_id ?? i.startup_id)).size

  const go = useCallback((id: string | undefined) => navigate({ search: (s) => ({ ...s, open: id }), replace: true }), [navigate])
  useListStepper(order, current?.id, go)

  // One path for every decision, single or bulk: save, refresh, say how many, offer Undo.
  const decide = (ids: string[], next: ReviewStatus, note?: string, after?: () => void) => {
    let previous: Awaited<ReturnType<typeof decideReviews>>['previous'] = []
    setBusy(true)
    const n = ids.length
    toaster.show(
      async () => {
        try {
          const r = await decideReviews({ data: { ids, status: next, note } })
          previous = r.previous
          setPicked((p) => {
            const rest = new Set(p)
            ids.forEach((id) => rest.delete(id))
            return rest
          })
          setBulkNote('')
          after?.()
          await router.invalidate()
          return r.count
        } finally {
          setBusy(false)
        }
      },
      {
        loading: next === 'open' ? `Reopening ${plural(n, 'finding')}` : `Saving ${plural(n, 'decision')}`,
        success: (count: number) =>
          next === 'open'
            ? `${plural(count, 'finding')} reopened`
            : `${plural(count, 'finding')} ${count === 1 ? DONE[next][0] : DONE[next][0].replace('a known gap', 'known gaps')}`,
        error: (e) => ['Nothing was saved', e instanceof Error ? e.message : String(e)],
        undo: {
          run: async () => {
            await restoreReviews({ data: { previous } })
            await router.invalidate()
          },
          success: 'Decision undone',
        },
      },
    )
  }

  // A decision in the drawer moves it on to the next finding in the list, so the queue is worked without closing it.
  const decideOne = (item: ReviewItem, next: ReviewStatus, note: string) => {
    const i = order.indexOf(item.id)
    const following = order[i + 1] ?? order[i - 1]
    decide([item.id], next, note, () => go(following))
  }

  const setStatus = (next: ReviewStatus) => {
    setPicked(new Set())
    navigate({ search: (s) => ({ ...s, status: next === 'open' ? undefined : next, open: undefined }) })
  }
  const toggle = (ids: string[], on: boolean) =>
    setPicked((p) => {
      const n = new Set(p)
      ids.forEach((id) => (on ? n.add(id) : n.delete(id)))
      return n
    })

  return (
    <OpsPage
      title="Review"
      lede={
        total('open') > 0
          ? `${plural(total('open'), 'open finding')} on ${plural(records, 'record')}. Open one to see its evidence and decide.`
          : 'Nothing is open. Every finding has a decision.'
      }
      className="pb-24"
    >
      <div className="flex flex-wrap items-center gap-2">
        <div role="radiogroup" aria-label="Finding status" className="inline-flex h-8 rounded-md border border-edge bg-canvas p-0.5">
          {(['open', 'resolved', 'dismissed'] as const).map((s) => (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={status === s}
              onClick={() => setStatus(s)}
              className="inline-flex items-center gap-1.5 rounded-[5px] px-2.5 text-[0.8125rem] text-ink-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-glaze aria-checked:bg-surface-raised aria-checked:font-medium aria-checked:text-ink"
            >
              {STATUS_LABEL[s]} <span className="tabular-nums">{total(s)}</span>
            </button>
          ))}
        </div>
        <select
          aria-label="Finding type"
          value={code ?? ''}
          onChange={(e) => navigate({ search: (s) => ({ ...s, code: e.target.value || undefined, open: undefined }) })}
          className={cn(opsControl, 'max-w-72')}
        >
          <option value="">All types · {total(status)}</option>
          {codes.map((c) => (
            <option key={c} value={c}>
              {findingName(c)} · {total(status, c)}
            </option>
          ))}
        </select>
        <label className="relative ms-auto block w-full sm:w-64">
          <span className="sr-only">Search by startup name or row number</span>
          <Search className="pointer-events-none absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-2" aria-hidden />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name or row number" className={cn(opsControl, 'w-full ps-8')} />
        </label>
      </div>

      {groups.length ? (
        <div className="overflow-x-auto rounded-md border border-edge">
          <table className="w-full table-fixed tabular-nums">
            <colgroup>
              <col className="w-10" />
              <col className="w-20" />
              <col className="w-[22%]" />
              <col className="w-[22%]" />
              <col />
              {status !== 'open' && <col className="w-56" />}
            </colgroup>
            <thead className="bg-surface">
              <tr>
                <th className={opsTh}>
                  <span className="sr-only">Select</span>
                </th>
                <th className={opsTh}>Row</th>
                <th className={opsTh}>Startup</th>
                <th className={opsTh}>Finding</th>
                <th className={opsTh}>Evidence</th>
                {status !== 'open' && <th className={opsTh}>Decided</th>}
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => {
                const ids = g.rows.map((r) => r.id)
                const on = ids.filter((id) => picked.has(id)).length
                return (
                  <Fragment key={g.code}>
                    <tr className={cn(opsRow, 'bg-canvas')}>
                      <td className="px-3 py-1.5">
                        <Check
                          label={`Select every finding in ${findingName(g.code)}`}
                          checked={on === ids.length}
                          mixed={on > 0 && on < ids.length}
                          onChange={(v) => toggle(ids, v)}
                        />
                      </td>
                      <td colSpan={status !== 'open' ? 5 : 4} className="px-3 py-1.5 text-[0.8125rem] text-ink-2">
                        <span className="font-medium text-ink">{findingName(g.code)}</span> · {plural(g.rows.length, 'finding')}
                      </td>
                    </tr>
                    {g.rows.map((item) => (
                      <tr
                        key={item.id}
                        onClick={() => go(item.id)}
                        aria-selected={item.id === open}
                        className={cn(opsRow, 'cursor-pointer hover:bg-surface aria-selected:bg-surface-raised')}
                      >
                        <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                          <Check label={`Select ${item.name ?? 'finding'}`} checked={picked.has(item.id)} onChange={(v) => toggle([item.id], v)} />
                        </td>
                        <td className={cn(opsTd, 'text-ink-2')}>{item.row_number ?? '—'}</td>
                        <td className={cn(opsTd, 'truncate')}>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              go(item.id)
                            }}
                            className="max-w-full truncate text-start font-medium text-ink hover:underline focus-visible:outline-2 focus-visible:outline-glaze"
                          >
                            {item.name ?? 'Unnamed'}
                          </button>
                        </td>
                        <td className={cn(opsTd, 'truncate')}>{findingName(item.code)}</td>
                        <td className={cn(opsTd, 'truncate')} title={evidenceLine(item)}>
                          {evidenceLine(item)}
                        </td>
                        {status !== 'open' && (
                          <td className={cn(opsTd, 'truncate')}>
                            {item.decided_at ? labTime(item.decided_at) : '—'}
                            {item.note && <span className="text-ink-2"> · {item.note}</span>}
                          </td>
                        )}
                      </tr>
                    ))}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty status={status} total={total} filtered={Boolean(code || q)} clear={() => (setQ(''), navigate({ search: (s) => ({ ...s, code: undefined }) }))} />
      )}

      <OpsDrawer
        open={Boolean(current)}
        onOpenChange={(v) => !v && go(undefined)}
        storageKey="review"
        itemKey={current?.id}
        eyebrow={current ? findingName(current.code) : ''}
        title={current ? `Row ${current.row_number ?? '—'} · ${current.name ?? 'Unnamed'}` : ''}
        footer={current && <DrawerActions key={current.id} item={current} busy={busy} onDecide={decideOne} position={`${order.indexOf(current.id) + 1} of ${order.length}`} />}
      >
        {current && <FindingBody item={current} />}
      </OpsDrawer>

      {selected.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-edge bg-surface">
          <div className="flex h-11 items-center gap-2 px-4 lg:px-8">
            <p className="me-1 text-[0.8125rem] whitespace-nowrap text-ink" aria-live="polite">
              {plural(selected.length, 'finding')} selected{selectedCodes.length === 1 ? ` in ${findingName(selectedCodes[0])}` : ` across ${selectedCodes.length} types`}
            </p>
            {status === 'open' ? (
              <>
                <input
                  value={bulkNote}
                  onChange={(e) => setBulkNote(e.target.value)}
                  maxLength={280}
                  aria-label="Note for every selected finding (optional)"
                  placeholder="Note for all, optional"
                  className={cn(opsControl, 'min-w-0 flex-1 sm:max-w-sm')}
                />
                <button type="button" className={opsPrimary} disabled={busy} onClick={() => decide(selected.map((i) => i.id), 'resolved', bulkNote)}>
                  <CircleCheck aria-hidden /> Fixed at source
                </button>
                <HoldButton disabled={busy} onConfirm={() => decide(selected.map((i) => i.id), 'dismissed', bulkNote)}>
                  Hold to keep as {selected.length === 1 ? 'a known gap' : 'known gaps'}
                </HoldButton>
              </>
            ) : (
              <button type="button" className={opsButton} disabled={busy} onClick={() => decide(selected.map((i) => i.id), 'open')}>
                <RotateCcw aria-hidden /> Reopen
              </button>
            )}
            <button type="button" className={cn(opsGhost, 'ms-auto')} onClick={() => setPicked(new Set())}>
              <X aria-hidden /> Clear
            </button>
          </div>
        </div>
      )}
    </OpsPage>
  )
}

function FindingBody({ item }: { item: ReviewItem }) {
  return (
    <div className="grid gap-4">
      <p className="text-[0.875rem] leading-6 text-ink">{findingSentence(item.code)}</p>
      <DuplicateList item={item} />
      <FieldList fields={evidenceFields(item)} />
      <div className="flex flex-wrap gap-2">
        {item.source_row_id && (
          <Link to="/portal/trace" search={{ row: item.source_row_id }} className={opsButton}>
            <RouteIcon aria-hidden /> Trace the row
          </Link>
        )}
        {item.startup_id && (
          <Link to="/startups/$id" params={{ id: item.startup_id }} className={opsButton}>
            <ExternalLink aria-hidden /> Open profile
          </Link>
        )}
      </div>
      {item.status !== 'open' && (
        <div className="grid gap-1 border-t border-hairline pt-3 text-[0.8125rem]">
          <p className="text-ink">
            {DONE[item.status as Exclude<ReviewStatus, 'open'>][1]}
            {item.decided_at && ` · ${labTime(item.decided_at)}`}
            {item.decided_by && ` · by ${item.decided_by}`}
          </p>
          {item.note && <p className="text-ink">“{item.note}”</p>}
        </div>
      )}
    </div>
  )
}

function DrawerActions({
  item,
  busy,
  onDecide,
  position,
}: {
  item: ReviewItem
  busy: boolean
  onDecide: (item: ReviewItem, next: ReviewStatus, note: string) => void
  position: string
}) {
  const [note, setNote] = useState('')
  if (item.status !== 'open')
    return (
      <div className="flex items-center gap-2">
        <span className="me-auto text-[0.8125rem] text-ink-2">{position} · J and K to move</span>
        <button type="button" className={opsButton} disabled={busy} onClick={() => onDecide(item, 'open', '')}>
          <RotateCcw aria-hidden /> Reopen
        </button>
      </div>
    )
  return (
    <div className="grid gap-2">
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={280}
        aria-label="Note (optional)"
        placeholder="Note, optional: what you checked or changed"
        className={cn(opsControl, 'w-full')}
      />
      <div className="flex flex-wrap items-center gap-2">
        <span className="me-auto text-[0.8125rem] text-ink-2">{position} · J and K to move</span>
        <button type="button" className={opsButton} disabled={busy} onClick={() => onDecide(item, 'dismissed', note)}>
          <Archive aria-hidden /> Keep as a known gap
        </button>
        <button type="button" className={opsPrimary} disabled={busy} onClick={() => onDecide(item, 'resolved', note)}>
          <CircleCheck aria-hidden /> Fixed at source
        </button>
      </div>
    </div>
  )
}

function Check({ label, checked, mixed, onChange }: { label: string; checked: boolean; mixed?: boolean; onChange: (v: boolean) => void }) {
  return (
    <input
      type="checkbox"
      aria-label={label}
      checked={checked}
      ref={(el) => {
        if (el) el.indeterminate = Boolean(mixed)
      }}
      onChange={(e) => onChange(e.target.checked)}
      className="size-4 cursor-pointer accent-[var(--glaze)] align-middle"
    />
  )
}

/** Interior's hold-to-confirm logic at the portal's size: the fill grows while held, release early to cancel. */
function HoldButton({ onConfirm, disabled, children }: { onConfirm: () => void; disabled?: boolean; children: React.ReactNode }) {
  const { bind, phase, progress } = useHoldToConfirm({ onConfirm, duration: 1200, disabled })
  const reduced = useReducedMotion()
  const committed = phase === 'committed'
  return (
    <button
      type="button"
      {...bind}
      disabled={disabled}
      aria-label={`${typeof children === 'string' ? children : 'Hold to confirm'}. Press and hold; releasing early cancels.`}
      style={{ touchAction: 'manipulation' }}
      className={cn(opsButton, 'relative isolate overflow-hidden select-none')}
    >
      <motion.span
        aria-hidden
        className="absolute inset-y-0 start-0 -z-10 bg-surface-raised"
        initial={false}
        animate={{ width: `${(committed ? 1 : progress) * 100}%` }}
        transition={reduced ? { duration: 0 } : { duration: 0.06, ease: 'linear' }}
      />
      <Archive aria-hidden />
      {committed ? 'Saving…' : children}
    </button>
  )
}

function Empty({
  status,
  total,
  filtered,
  clear,
}: {
  status: ReviewStatus
  total: (s: ReviewStatus) => number
  filtered: boolean
  clear: () => void
}) {
  const others = (['open', 'resolved', 'dismissed'] as const).filter((s) => s !== status).map((s) => `${STATUS_LABEL[s].toLowerCase()} ${total(s)}`)
  return (
    <div className="grid justify-items-start gap-2 rounded-md border border-edge bg-surface p-4 text-[0.875rem] text-ink">
      {filtered ? (
        <>
          <p>No finding matches these filters.</p>
          <button type="button" className={opsButton} onClick={clear}>
            Clear the filters
          </button>
        </>
      ) : (
        <p>
          {status === 'open' ? 'Nothing is open.' : status === 'resolved' ? 'Nothing is marked fixed at source yet.' : 'No finding is kept as a known gap yet.'} Elsewhere:{' '}
          {others.join(', ')}.
        </p>
      )}
    </div>
  )
}
