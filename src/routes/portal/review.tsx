import { createFileRoute, useNavigate, useRouter } from '@tanstack/react-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { Desk, DeskBar, DeskEmpty, DeskGroup, DeskItem, deskBtn, useDeskKeys } from '@/components/athar/desk'
import { DeskSwitch, KIND_NAME, ReviewPane, answerWords, subjectWords } from '@/components/athar/review-desk'
import { ReviewFilters } from '@/components/athar/review-filters'
import { plural } from '@/components/athar/trace-parts'
import { decideReview, forgetStaleDecisions, getReviewContext, getReviewQueue, getReviewSummary, undoReview, type Json } from '#/server/api/review'

type SearchParams = { reading?: string; kind?: string; show?: 'open' | 'decided' }

export const Route = createFileRoute('/portal/review')({
  validateSearch: (s: Record<string, unknown>): SearchParams => ({
    reading: typeof s.reading === 'string' && s.reading ? s.reading : undefined,
    kind: typeof s.kind === 'string' && s.kind ? s.kind : undefined,
    show: s.show === 'decided' ? 'decided' : undefined,
  }),
  loaderDeps: ({ search }) => ({ reading: search.reading, kind: search.kind, show: search.show ?? 'open' }),
  loader: async ({ deps }) => {
    const [summary, items] = await Promise.all([getReviewSummary(), getReviewQueue({ data: { kind: deps.kind, include: deps.show } })])
    const readingId = deps.reading ?? items[0]?.id
    // A reading just answered leaves the open list but stays on screen until the selection moves.
    const item = readingId ? (items.find((i) => i.id === readingId) ?? (await getReviewQueue({ data: { include: 'all' } })).find((i) => i.id === readingId)) : undefined
    const context = readingId ? await getReviewContext({ data: readingId }) : null
    return { summary, items, readingId, item, context }
  },
  component: ReviewPage,
})

function ReviewPage() {
  const { summary, items, readingId, item, context } = Route.useLoaderData()
  const search = Route.useSearch()
  const show = search.show ?? 'open'
  const navigate = useNavigate({ from: '/portal/review' })
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const refocus = useRef(false)

  const open = summary.toAnswer
  const waiting = summary.waitingOnPerson
  const [query, setQuery] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)
  const settled = summary.totals.rule + summary.totals.inferred
  const sentence = `${open === 0 ? 'No questions wait for you' : `${plural(open, 'question')} ${open === 1 ? 'waits' : 'wait'} for you`}; ${plural(settled, 'reading')} ${settled === 1 ? 'was' : 'were'} settled by rules or inferred${summary.totals.decided ? `; you answered ${summary.totals.decided.toLocaleString('en-GB')}` : ''}.`

  // A new question starts with an empty note and no old error.
  useEffect(() => {
    setNote('')
    setError(null)
  }, [readingId])

  // After an answer, focus goes back to the list row the selection moved to.
  useEffect(() => {
    if (!refocus.current) return
    refocus.current = false
    document.getElementById(`rv-${readingId}`)?.querySelector('button')?.focus()
  }, [readingId, items])

  const select = useCallback((id: string) => navigate({ search: (s) => ({ ...s, reading: id }) }), [navigate])
  // The text filter narrows the list already loaded: person and startup names, accents and case ignored.
  const fold = (t: string) => t.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
  const needle = fold(query.trim())
  const shownItems = useMemo(() => (needle ? items.filter((i) => fold(`${subjectWords(i)} ${i.subject}`).includes(needle)) : items), [items, needle])
  const ids = useMemo(() => shownItems.map((i) => i.id), [shownItems])

  const run = useCallback(
    async (act: () => Promise<unknown>) => {
      if (!readingId) return
      const at = ids.indexOf(readingId)
      const next = ids[at + 1] ?? ids[at - 1]
      setBusy(true)
      setError(null)
      try {
        await act()
        refocus.current = true
        // Stay in place: the neighbour that now holds the answered row's position.
        if (next) await navigate({ search: (s) => ({ ...s, reading: next }) })
        await router.invalidate()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'The server did not answer')
      } finally {
        setBusy(false)
      }
    },
    [readingId, ids, navigate, router],
  )

  const answer = useCallback(
    (value: Json) => {
      if (!readingId || busy) return
      void run(() => decideReview({ data: { id: readingId, value, note: note.trim() || null } }))
    },
    [readingId, busy, note, run],
  )
  const undo = useCallback(() => {
    if (!readingId || busy) return
    void run(() => undoReview({ data: readingId }))
  }, [readingId, busy, run])

  const keys = useMemo(() => {
    const k: Record<string, () => void> = {}
    if (item?.decided) k.u = undo
    else context?.answers.forEach((a, i) => (k[String(i + 1)] = () => answer(a.value)))
    return k
  }, [item, context, answer, undo])
  useDeskKeys({ ids, current: readingId, select, search: searchRef, keys })

  // Group headers in the order the API returns.
  const groups: { kind: string; rows: typeof items }[] = []
  for (const it of shownItems) {
    const last = groups[groups.length - 1]
    if (last?.kind === it.kind) last.rows.push(it)
    else groups.push({ kind: it.kind, rows: [it] })
  }

  const list = (
    <div role="list" aria-label={show === 'open' ? 'Questions to answer' : 'Answered questions'}>
      {groups.map((g) => (
        <div role="group" aria-label={KIND_NAME[g.kind] ?? g.kind} key={g.kind}>
          <DeskGroup label={KIND_NAME[g.kind] ?? g.kind} count={g.rows.length} />
          {g.rows.map((it) => (
            <div role="listitem" key={it.id}>
              <DeskItem
                id={`rv-${it.id}`}
                selected={it.id === readingId}
                onSelect={() => select(it.id)}
                title={<span dir="auto">{subjectWords(it)}</span>}
                qualifier={it.decided ? answerWords(it.decided) : undefined}
                detail={it.why}
              />
            </div>
          ))}
        </div>
      ))}
    </div>
  )

  const position = readingId && ids.includes(readingId) ? `${ids.indexOf(readingId) + 1} of ${ids.length}` : undefined
  const empty =
    show === 'open' && items.length === 0 ? (
      <DeskEmpty>Nothing waits for you. Every reading is settled, inferred or answered.</DeskEmpty>
    ) : items.length === 0 ? (
      <DeskEmpty>You have not answered any question yet.</DeskEmpty>
    ) : (
      <DeskEmpty>Choose a question to see what to compare.</DeskEmpty>
    )

  return (
    <main className="flex min-h-0 flex-1 flex-col">
      <DeskBar
        title="Review"
        facts={sentence}
        actions={
          summary.stale > 0 ? (
            <button
              type="button"
              className={deskBtn}
              disabled={busy}
              onClick={async () => {
                setBusy(true)
                try {
                  await forgetStaleDecisions()
                  await router.invalidate()
                } catch (e) {
                  setError(e instanceof Error ? e.message : 'The server did not answer')
                } finally {
                  setBusy(false)
                }
              }}
            >
              Forget {plural(summary.stale, 'decision')} that no longer {summary.stale === 1 ? 'applies' : 'apply'}
            </button>
          ) : undefined
        }
      >
        <DeskSwitch current="review" open={open} />
      </DeskBar>
      <ReviewFilters
        show={show}
        kind={search.kind}
        byKind={summary.byKind}
        totals={{ open: summary.byKind.reduce((t, k) => t + k.open, 0), decided: summary.byKind.reduce((t, k) => t + k.decided, 0) }}
        query={query}
        onQuery={setQuery}
        searchRef={searchRef}
        onShow={(v) => navigate({ search: (s) => ({ ...s, show: v === 'decided' ? 'decided' : undefined, reading: undefined }) })}
        kindName={(k) => KIND_NAME[k] ?? k}
        waiting={waiting}
        shown={shownItems.length}
        total={items.length}
      />
      <Desk
        storageKey="review"
        showPaneOnNarrow={!!search.reading}
        onBack={() => navigate({ search: (s) => ({ ...s, reading: undefined }) })}
        backLabel="All questions"
        list={
          items.length === 0 ? (
            <p className="px-4 py-6 text-[0.875rem] text-ink">{show === 'open' ? 'No question to answer.' : 'No answered question.'}</p>
          ) : shownItems.length === 0 ? (
            <p className="px-4 py-6 text-[0.875rem] text-ink">
              No question matches “{query.trim()}”.{' '}
              <button type="button" className="text-glaze underline" onClick={() => setQuery('')}>
                Clear the filter
              </button>
            </p>
          ) : (
            list
          )
        }
        pane={
          context ? (
            <ReviewPane ctx={context} item={item} position={position} busy={busy} error={error} note={note} onNote={setNote} onAnswer={answer} onUndo={undo} />
          ) : (
            empty
          )
        }
      />
    </main>
  )
}

