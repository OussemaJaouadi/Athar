import { Link, createFileRoute, useNavigate, useRouter } from '@tanstack/react-router'
import { Archive, CircleCheck, MessageSquarePlus, RotateCcw, Search, X } from 'lucide-react'
import { useMemo, useState } from 'react'

import { plural } from '@/components/athar/collect-button'
import { findingName, findingSentence, labTime, useLabToaster } from '@/components/athar/lab'
import { ReviewEvidence } from '@/components/athar/review-evidence'
import { HoldToConfirm } from '@/components/interior/hold-to-confirm'
import { SegmentedControl } from '@/components/interior/segmented-control'
import { cn } from '@/lib/utils'
import { decideReviews, listReviewQueue, restoreReviews, type ReviewItem, type ReviewStatus } from '#/server/api/review'

type Search = { status?: ReviewStatus; code?: string }

export const Route = createFileRoute('/portal/review')({
  validateSearch: (s: Record<string, unknown>): Search => ({
    status: s.status === 'resolved' || s.status === 'dismissed' || s.status === 'open' ? s.status : undefined,
    code: typeof s.code === 'string' && s.code ? s.code : undefined,
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

const button =
  'inline-flex h-9 items-center gap-2 rounded-md border border-edge bg-canvas px-3 text-[0.875rem] font-medium text-ink hover:border-ink disabled:cursor-not-allowed disabled:text-ink-2'
const primary =
  'inline-flex h-9 items-center gap-2 rounded-md bg-glaze px-3 text-[0.875rem] font-medium text-glaze-ink hover:bg-[var(--glaze-hover)] disabled:cursor-not-allowed disabled:bg-surface-raised disabled:text-ink-2'

function ReviewPage() {
  const { items, counts, status } = Route.useLoaderData()
  const { code } = Route.useSearch()
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
      (i) =>
        (!code || i.code === code) &&
        (!needle || (i.name ?? '').toLowerCase().includes(needle) || String(i.row_number ?? '').startsWith(needle)),
    )
  }, [items, code, q])
  const groups = [...new Set(shown.map((i) => i.code))].map((c) => ({ code: c, rows: shown.filter((i) => i.code === c) }))
  const selected = shown.filter((i) => picked.has(i.id))
  const selectedCodes = [...new Set(selected.map((i) => i.code))]

  const records = new Set(items.filter((i) => i.status === 'open').map((i) => i.source_row_id ?? i.startup_id)).size

  // One path for every decision, single or bulk: save, refresh, say how many, offer Undo.
  const decide = (ids: string[], next: ReviewStatus, note?: string) => {
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

  const setStatus = (next: string) => {
    setPicked(new Set())
    navigate({ search: (s) => ({ ...s, status: next === 'open' ? undefined : (next as ReviewStatus) }) })
  }

  return (
    <main className="grid content-start gap-8 p-4 pb-32 lg:p-8 lg:pb-32">
      <header className="grid max-w-[64rem] gap-3">
        <h1 className="font-display text-[1.75rem] leading-9">Review</h1>
        <p className="font-display text-[1.625rem] leading-10 text-ink">
          {total('open') > 0
            ? `${plural(total('open'), 'finding')} ${total('open') === 1 ? 'is' : 'are'} open on ${plural(records, 'record')}. Each is either fixed at its source or kept as a known gap.`
            : 'Nothing is open. Every finding has a decision.'}
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
        <SegmentedControl
          label="Finding status"
          value={status}
          onValueChange={setStatus}
          className="border-edge!"
          options={(['open', 'resolved', 'dismissed'] as const).map((s) => ({ value: s, label: `${STATUS_LABEL[s]} ${total(s)}` }))}
        />
        <div role="group" aria-label="Finding type" className="flex flex-wrap gap-2">
          <TypeChip active={!code} onClick={() => navigate({ search: (s) => ({ ...s, code: undefined }) })}>
            All types <span className="tabular-nums">{total(status)}</span>
          </TypeChip>
          {codes.map((c) => (
            <TypeChip key={c} active={code === c} onClick={() => navigate({ search: (s) => ({ ...s, code: c }) })}>
              {findingName(c)} <span className="tabular-nums">{total(status, c)}</span>
            </TypeChip>
          ))}
        </div>
        <label className="relative ms-auto flex w-full items-center sm:w-80">
          <span className="sr-only">Find a startup by name or row number</span>
          <Search className="pointer-events-none absolute start-3 size-4 text-ink-2" aria-hidden />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Startup name or row number"
            className="h-9 w-full rounded-md border border-edge bg-surface ps-9 pe-3 text-[0.875rem] text-ink placeholder:text-ink-2"
          />
        </label>
      </div>

      {groups.map(({ code: c, rows }) => {
        const all = rows.every((r) => picked.has(r.id))
        const some = !all && rows.some((r) => picked.has(r.id))
        return (
          <section key={c} aria-labelledby={`g-${c}`} className="grid gap-3">
            <div className="flex flex-wrap items-start gap-x-4 gap-y-1">
              <label className="mt-0.5 grid size-8 shrink-0 cursor-pointer place-items-center rounded-md hover:bg-surface">
                <input
                  type="checkbox"
                  className="size-4 accent-glaze"
                  aria-label={`Select all ${rows.length} in ${findingName(c)}`}
                  checked={all}
                  ref={(el) => {
                    if (el) el.indeterminate = some
                  }}
                  onChange={() =>
                    setPicked((p) => {
                      const next = new Set(p)
                      rows.forEach((r) => (all ? next.delete(r.id) : next.add(r.id)))
                      return next
                    })
                  }
                />
              </label>
              <div className="grid min-w-0 flex-1 gap-1">
                <h2 id={`g-${c}`} className="font-sans text-[0.9375rem] font-medium text-ink">
                  {findingName(c)} <span className="ms-1 font-normal tabular-nums">· {plural(rows.length, 'finding')}</span>
                </h2>
                <p className="text-ink">{findingSentence(c)}</p>
              </div>
            </div>
            <ul className="grid gap-2">
              {rows.map((item) => (
                <ReviewRow
                  key={item.id}
                  item={item}
                  picked={picked.has(item.id)}
                  busy={busy}
                  onPick={(on) =>
                    setPicked((p) => {
                      const next = new Set(p)
                      if (on) next.add(item.id)
                      else next.delete(item.id)
                      return next
                    })
                  }
                  onDecide={(next, note) => decide([item.id], next, note)}
                />
              ))}
            </ul>
          </section>
        )
      })}

      {!groups.length && (
        <section className="grid max-w-2xl gap-2 rounded-lg border border-edge bg-surface p-6">
          {q.trim() || code ? (
            <>
              <p className="text-[0.9375rem] text-ink">
                No {STATUS_LABEL[status].toLowerCase()} finding matches {q.trim() ? `“${q.trim()}”` : 'this type'}.
              </p>
              <button
                type="button"
                className={cn(button, 'w-fit')}
                onClick={() => {
                  setQ('')
                  navigate({ search: (s) => ({ ...s, code: undefined }) })
                }}
              >
                <X className="size-4" aria-hidden /> Clear the filters
              </button>
            </>
          ) : (
            <>
              <p className="font-display text-[1.375rem] leading-8 text-ink">
                {status === 'open' ? 'Nothing open.' : status === 'resolved' ? 'Nothing marked fixed at source yet.' : 'No known gaps yet.'}
              </p>
              <p className="text-ink">
                {status === 'open'
                  ? `${plural(total('resolved'), 'finding')} fixed at source, ${plural(total('dismissed'), 'known gap')}.`
                  : `${plural(total('open'), 'finding')} still open.`}
              </p>
            </>
          )}
        </section>
      )}

      {selected.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-edge bg-surface-raised">
          <div className="flex flex-wrap items-center gap-3 px-4 py-3 lg:px-8" role="region" aria-label="Selected findings">
            <p className="text-[0.9375rem] font-medium text-ink" aria-live="polite">
              {plural(selected.length, 'finding')} selected{' '}
              {selectedCodes.length === 1 ? `in ${findingName(selectedCodes[0])}` : `across ${selectedCodes.length} types`}
            </p>
            {status === 'open' ? (
              <>
                <input
                  value={bulkNote}
                  onChange={(e) => setBulkNote(e.target.value)}
                  maxLength={280}
                  aria-label="Note for every selected finding (optional)"
                  placeholder="Note for all, optional"
                  className="h-9 min-w-0 flex-1 rounded-md border border-edge bg-canvas px-3 text-[0.875rem] text-ink placeholder:text-ink-2 sm:max-w-md"
                />
                <button type="button" className={primary} disabled={busy} onClick={() => decide(selected.map((i) => i.id), 'resolved', bulkNote)}>
                  <CircleCheck className="size-4" aria-hidden /> Fixed at source
                </button>
                <HoldToConfirm
                  disabled={busy}
                  confirmLabel="Kept as known gaps"
                  onConfirm={() => decide(selected.map((i) => i.id), 'dismissed', bulkNote)}
                  className="h-9! rounded-md! border-edge! bg-canvas! text-[0.875rem]! text-ink! [&>span[aria-hidden]]:bg-ink! [&>span[aria-hidden]]:text-canvas!"
                >
                  <span className="inline-flex items-center gap-2">
                    <Archive className="size-4" aria-hidden /> Hold to keep {selected.length === 1 ? 'as a known gap' : 'as known gaps'}
                  </span>
                </HoldToConfirm>
              </>
            ) : (
              <button type="button" className={button} disabled={busy} onClick={() => decide(selected.map((i) => i.id), 'open')}>
                <RotateCcw className="size-4" aria-hidden /> Reopen
              </button>
            )}
            <button type="button" className={cn(button, 'ms-auto')} onClick={() => setPicked(new Set())}>
              <X className="size-4" aria-hidden /> Clear selection
            </button>
          </div>
        </div>
      )}
    </main>
  )
}

function TypeChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'inline-flex h-9 items-center gap-2 rounded-md border px-3 text-[0.875rem] text-ink',
        active ? 'border-ink bg-surface-raised font-medium shadow-[inset_0_0_0_1px_var(--ink)]' : 'border-edge bg-surface hover:border-ink',
      )}
    >
      {children}
    </button>
  )
}

function ReviewRow({
  item,
  picked,
  busy,
  onPick,
  onDecide,
}: {
  item: ReviewItem
  picked: boolean
  busy: boolean
  onPick: (on: boolean) => void
  onDecide: (next: ReviewStatus, note?: string) => void
}) {
  const [noting, setNoting] = useState(false)
  const [note, setNote] = useState('')
  const label = item.name || 'Unnamed startup'
  return (
    <li
      className={cn(
        'grid grid-cols-[2rem_minmax(0,1fr)] gap-x-4 gap-y-3 rounded-lg border bg-surface p-4 lg:grid-cols-[2rem_minmax(14rem,18rem)_minmax(0,1fr)_auto] lg:items-start',
        picked ? 'border-ink shadow-[inset_0_0_0_1px_var(--ink)]' : 'border-edge',
      )}
    >
      <label className="row-span-3 grid size-8 cursor-pointer place-items-center rounded-md hover:bg-surface-raised lg:row-span-1">
        <input type="checkbox" className="size-4 accent-glaze" aria-label={`Select ${label}`} checked={picked} onChange={(e) => onPick(e.target.checked)} />
      </label>

      <div className="grid min-w-0 gap-1">
        <span className="font-mono text-[0.8125rem] text-ink-2">{item.row_number !== null ? `Row ${item.row_number}` : 'No source row'}</span>
        {item.source_row_id ? (
          <Link to="/portal/trace/$rowId" params={{ rowId: item.source_row_id }} className="text-[0.9375rem] font-medium text-glaze underline" title="Trace this source row">
            {label}
          </Link>
        ) : (
          <span className="text-[0.9375rem] font-medium text-ink">{label}</span>
        )}
        {item.startup_id && (
          <Link to="/startups/$id" params={{ id: item.startup_id }} className="w-fit text-[0.8125rem] text-glaze underline">
            Open profile
          </Link>
        )}
      </div>

      <div className="grid min-w-0 gap-2">
        <ReviewEvidence item={item} />
        {item.status !== 'open' && (
          <p className="flex flex-wrap items-center gap-x-2 border-s-2 border-edge ps-3 text-ink">
            {item.status === 'resolved' ? <CircleCheck className="size-4" aria-hidden /> : <Archive className="size-4" aria-hidden />}
            <span className="font-medium">{DONE[item.status][1]}</span>
            {item.decided_at && <span>· {labTime(item.decided_at)}</span>}
            {item.decided_by && <span>· by {item.decided_by}</span>}
            {item.note && <span className="basis-full">“{item.note}”</span>}
          </p>
        )}
        {noting && item.status === 'open' && (
          <input
            autoFocus
            value={note}
            maxLength={280}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && (setNoting(false), setNote(''))}
            aria-label={`Note for ${label} (optional)`}
            placeholder="Why, in one line. Saved with the decision."
            className="h-9 w-full rounded-md border border-edge bg-canvas px-3 text-[0.875rem] text-ink placeholder:text-ink-2"
          />
        )}
      </div>

      <div className="col-start-2 flex flex-wrap gap-2 lg:col-start-auto lg:justify-end">
        {item.status === 'open' ? (
          <>
            {!noting && (
              <button type="button" className={button} onClick={() => setNoting(true)} aria-label={`Add a note for ${label}`}>
                <MessageSquarePlus className="size-4" aria-hidden /> Note
              </button>
            )}
            <button type="button" className={button} disabled={busy} onClick={() => onDecide('resolved', note)}>
              <CircleCheck className="size-4" aria-hidden /> Fixed at source
            </button>
            <button type="button" className={button} disabled={busy} onClick={() => onDecide('dismissed', note)}>
              <Archive className="size-4" aria-hidden /> Keep as a known gap
            </button>
          </>
        ) : (
          <button type="button" className={button} disabled={busy} onClick={() => onDecide('open')}>
            <RotateCcw className="size-4" aria-hidden /> Reopen
          </button>
        )}
      </div>
    </li>
  )
}
