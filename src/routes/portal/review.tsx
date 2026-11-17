import { Link, createFileRoute, useNavigate, useRouter } from '@tanstack/react-router'
import { Search } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  Desk,
  DeskBar,
  DeskEmpty,
  DeskGroup,
  DeskItem,
  DeskPane,
  Evidence,
  Fields,
  JsonBlock,
  Kbd,
  PaneSection,
  deskBtn,
  deskInput,
  deskPrimary,
  parseJson,
  useDeskKeys,
} from '@/components/athar/desk'
import { findingName, labTime, useLabToaster } from '@/components/athar/lab'
import { DuplicateList, evidenceRows, listDetail } from '@/components/athar/review-evidence'
import { decideReviews, listReviewQueue, restoreReviews, type ReviewItem, type ReviewStatus } from '#/server/api/review'

type Search = { status?: 'decided'; code?: string; row?: string }

export const Route = createFileRoute('/portal/review')({
  validateSearch: (s: Record<string, unknown>): Search => ({
    status: s.status === 'decided' || s.status === 'resolved' || s.status === 'dismissed' ? 'decided' : undefined,
    code: typeof s.code === 'string' && s.code ? s.code : undefined,
    row: typeof s.row === 'string' && s.row ? s.row : undefined,
  }),
  loaderDeps: ({ search }) => ({ status: search.status }),
  loader: ({ deps }) => listReviewQueue({ data: { status: deps.status } }),
  component: ReviewPage,
})

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString('en-GB')} ${n === 1 ? one : many}`
const DECISION: Record<Exclude<ReviewStatus, 'open'>, string> = { dismissed: 'Kept as is', resolved: 'Fixed at source' }
type Previous = Awaited<ReturnType<typeof decideReviews>>['previous']

function ReviewPage() {
  const { items, counts, view, snapshot } = Route.useLoaderData()
  const search = Route.useSearch()
  const navigate = useNavigate({ from: '/portal/review' })
  const router = useRouter()
  const toaster = useLabToaster()
  const searchRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const last = useRef<Previous | null>(null)

  const openCount = counts.filter((c) => c.status === 'open').reduce((t, c) => t + c.count, 0)
  const decidedCount = counts.filter((c) => c.status !== 'open').reduce((t, c) => t + c.count, 0)
  const byCode = useMemo(() => {
    const m = new Map<string, number>()
    for (const c of counts) if ((view === 'open') === (c.status === 'open')) m.set(c.code, (m.get(c.code) ?? 0) + c.count)
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }, [counts, view])

  // The visible list: type filter, then the search over name and row number, grouped by finding type.
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase()
    const shown = items.filter(
      (i) =>
        (!search.code || i.code === search.code) &&
        (!q || (i.name ?? '').toLowerCase().includes(q) || String(i.row_number ?? '') === q.replace(/^row\s*/, '')),
    )
    const m = new Map<string, ReviewItem[]>()
    for (const i of shown) m.set(i.code, [...(m.get(i.code) ?? []), i])
    return [...m.entries()].sort((a, b) => b[1].length - a[1].length)
  }, [items, search.code, query])
  const order = useMemo(() => groups.flatMap(([, g]) => g.map((i) => i.id)), [groups])
  const current = items.find((i) => i.id === search.row && order.includes(i.id)) ?? items.find((i) => i.id === order[0])

  const select = useCallback((id: string | undefined) => navigate({ search: (s) => ({ ...s, row: id }), replace: true }), [navigate])
  useEffect(() => setNote(''), [current?.id])

  // One path for every decision: save, move to the next finding, say what happened, offer Undo (also Z).
  const decide = (item: ReviewItem, next: ReviewStatus) => {
    if (busy) return
    const i = order.indexOf(item.id)
    const following = next === 'open' ? item.id : (order[i + 1] ?? order[i - 1])
    const saved = note
    setBusy(true)
    toaster.show(
      async () => {
        try {
          const r = await decideReviews({ data: { ids: [item.id], status: next, note: saved } })
          last.current = r.previous
          if (next !== 'open') select(following === item.id ? undefined : following)
          await router.invalidate()
          return r.count
        } finally {
          setBusy(false)
        }
      },
      {
        loading: next === 'open' ? 'Reopening the finding' : 'Saving the decision',
        success: next === 'open' ? `${item.name ?? 'Finding'} reopened` : `${item.name ?? 'Finding'}: ${DECISION[next].toLowerCase()}`,
        error: (e) => ['Nothing was saved', e instanceof Error ? e.message : String(e)],
        undo: {
          run: async () => {
            await restoreReviews({ data: { previous: last.current ?? [] } })
            last.current = null
            await router.invalidate()
          },
          success: 'Decision undone',
        },
      },
    )
  }

  const undoLast = () => {
    const previous = last.current
    if (!previous?.length) return
    last.current = null
    toaster.show(
      async () => {
        await restoreReviews({ data: { previous } })
        select(previous[0].id)
        await router.invalidate()
      },
      { loading: 'Undoing', success: 'Decision undone', error: (e) => ['Could not undo', e instanceof Error ? e.message : String(e)] },
    )
  }

  useDeskKeys({
    ids: order,
    current: current?.id,
    select,
    search: searchRef,
    keys:
      current && view === 'open'
        ? { e: () => decide(current, 'dismissed'), f: () => decide(current, 'resolved'), z: undoLast }
        : { z: undoLast },
  })

  const group = current ? groups.find(([code]) => code === current.code)?.[1] : undefined
  const rowCount = snapshot?.row_count ?? 0
  const collected = snapshot
    ? new Date(snapshot.fetched_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    : null

  return (
    <main className="flex min-h-0 flex-1 flex-col">
      <DeskBar title="Review" facts={collected ? `Collected ${collected} · ${plural(rowCount, 'source row')}` : 'Nothing collected yet'}>
        <FilterChip next={(s: Search) => ({ ...s, status: undefined, row: undefined, code: undefined })} on={view === 'open'}>
          Open <b className="font-medium tabular-nums">{openCount}</b>
        </FilterChip>
        <FilterChip next={(s: Search) => ({ ...s, status: 'decided' as const, row: undefined, code: undefined })} on={view === 'decided'}>
          Decided <b className="font-medium tabular-nums">{decidedCount}</b>
        </FilterChip>
        {byCode.length > 1 && (
          <>
            <span aria-hidden className="h-5 w-px bg-hairline" />
            <FilterChip next={(s: Search) => ({ ...s, code: undefined, row: undefined })} on={!search.code}>
              All types
            </FilterChip>
            {byCode.map(([code, n]) => (
              <FilterChip key={code} next={(s: Search) => ({ ...s, code, row: undefined })} on={search.code === code}>
                {findingName(code)} <span className="text-ink-2 tabular-nums">{n}</span>
              </FilterChip>
            ))}
          </>
        )}
        <label className="relative">
          <span className="sr-only">Search findings by startup name or row number</span>
          <Search className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-ink-2" aria-hidden />
          <input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Startup or row"
            className={`${deskInput} w-52 ps-8`}
          />
          <span className="pointer-events-none absolute end-2 top-1/2 -translate-y-1/2">
            <Kbd>/</Kbd>
          </span>
        </label>
      </DeskBar>

      <Desk
        storageKey="review"
        showPaneOnNarrow={!!search.row}
        onBack={() => select(undefined)}
        list={
          order.length ? (
            groups.map(([code, list]) => (
              <section key={code} aria-label={findingName(code)}>
                <DeskGroup label={findingName(code)} count={list.length} />
                {list.map((item) => {
                  const d = listDetail(item)
                  return (
                    <DeskItem
                      key={item.id}
                      selected={item.id === current?.id}
                      onSelect={() => select(item.id)}
                      title={item.name ?? 'Unnamed startup'}
                      qualifier={item.row_number ? `row ${item.row_number}` : undefined}
                      detail={view === 'decided' && item.status !== 'open' ? `${DECISION[item.status]} · ${d.text}` : d.text}
                      detailMono={view === 'open' && d.mono}
                    />
                  )
                })}
              </section>
            ))
          ) : (
            <p className="px-4 py-6 text-[0.875rem] text-ink">
              {items.length ? 'No finding matches.' : view === 'open' ? 'Nothing is open. Every finding is decided.' : 'Nothing decided yet.'}
            </p>
          )
        }
        pane={
          current ? (
            <FindingPane
              item={current}
             
              position={group ? `${group.indexOf(current) + 1} of ${group.length} in this group` : undefined}
              note={note}
              setNote={setNote}
              busy={busy}
              onDecide={(next) => decide(current, next)}
            />
          ) : (
            <DeskEmpty>{view === 'open' ? 'Nothing to review.' : 'No decided findings yet.'}</DeskEmpty>
          )
        }
      />
    </main>
  )
}

function FindingPane({
  item,
  position,
  note,
  setNote,
  busy,
  onDecide,
}: {
  item: ReviewItem
  position?: string
  note: string
  setNote: (v: string) => void
  busy: boolean
  onDecide: (next: ReviewStatus) => void
}) {
  const raw = parseJson<unknown>(item.raw_json, null)
  const decided = item.status !== 'open'
  return (
    <DeskPane
      title={item.name ?? 'Unnamed startup'}
      statement={findingName(item.code)}
      position={position}
      foot={
        decided ? (
          <>
            <p className="min-w-0 flex-1 text-[0.875rem] text-ink">
              <span className="font-medium">{DECISION[item.status as Exclude<ReviewStatus, 'open'>]}</span>
              {item.decided_at && <span className="text-ink-2"> · {labTime(item.decided_at)}</span>}
              {item.note && <span> · {item.note}</span>}
            </p>
            <button type="button" className={deskBtn} disabled={busy} onClick={() => onDecide('open')}>
              Reopen
            </button>
          </>
        ) : (
          <>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Note (optional)"
              aria-label="Note"
              maxLength={280}
              className={`${deskInput} flex-1`}
            />
            <button type="button" className={deskBtn} disabled={busy} onClick={() => onDecide('dismissed')}>
              Keep as is <Kbd>E</Kbd>
            </button>
            <button type="button" className={deskPrimary} disabled={busy} onClick={() => onDecide('resolved')}>
              Fixed at source <Kbd>F</Kbd>
            </button>
          </>
        )
      }
    >
      {item.code === 'possible_duplicate' ? (
        <PaneSection title="Startups with this name">
          <DuplicateList item={item} />
        </PaneSection>
      ) : (
        <PaneSection title="What cleaning did">
          <Evidence rows={evidenceRows(item)} />
        </PaneSection>
      )}
      <div className="grid gap-7 min-[1400px]:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
        <PaneSection title="Record">
          <Fields
            fields={[
              { label: 'Sector', value: item.sector ?? '' },
              { label: 'Labelled', value: item.raw_label ?? '' },
              { label: 'Founded', value: item.creation_year ?? item.raw_creation_year ?? '' },
            ]}
          />
          {item.source_row_id && (
            <p className="mt-2.5 text-[0.875rem]">
              <Link to="/portal/trace" search={{ row: item.source_row_id }} className="text-glaze underline">
                Open the full trace
              </Link>
            </p>
          )}
        </PaneSection>
        <PaneSection title={item.row_number ? `Row ${item.row_number} as downloaded` : 'Row as downloaded'}>
          {raw === null ? <p className="text-[0.875rem] text-ink-3">empty</p> : <JsonBlock value={raw} title="raw_json" />}
        </PaneSection>
      </div>
    </DeskPane>
  )
}

/** A page-bar chip for Review's filters (same look as the kit's Chip, typed to this route's search). */
function FilterChip({ on, next, children }: { on: boolean; next: (s: Search) => Search; children: React.ReactNode }) {
  return (
    <Link
      to="/portal/review"
      search={next}
      aria-current={on ? 'true' : undefined}
      className={`inline-flex h-7 items-center gap-1.5 rounded-[5px] border border-edge px-2.5 text-[0.8125rem] whitespace-nowrap text-ink no-underline ${
        on ? 'bg-surface-raised shadow-[inset_0_-2px_0_var(--ink)]' : 'hover:bg-surface'
      }`}
    >
      {children}
    </Link>
  )
}
