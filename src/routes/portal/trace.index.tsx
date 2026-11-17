import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { ChevronRight, LoaderCircle, Search } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { findTraceRows } from '#/server/api/trace'

type SearchParams = { q?: string }

export const Route = createFileRoute('/portal/trace/')({
  validateSearch: (s: Record<string, unknown>): SearchParams => ({
    q: typeof s.q === 'string' && s.q.trim() ? s.q : undefined,
  }),
  loaderDeps: ({ search }) => ({ q: search.q ?? '' }),
  loader: ({ deps }) => findTraceRows({ data: deps.q }),
  component: TracePicker,
})

const n = (v: number) => v.toLocaleString('en-GB')

function TracePicker() {
  const { hits, total, snapshotRows } = Route.useLoaderData()
  const { q = '' } = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const [draft, setDraft] = useState(q)
  const typed = useRef(false)

  // Search as you type: the URL follows the field after a short pause, so results are shareable and Back works.
  useEffect(() => {
    if (!typed.current) return
    const t = setTimeout(() => navigate({ search: { q: draft.trim() || undefined }, replace: true }), 220)
    return () => clearTimeout(t)
  }, [draft, navigate])
  const pending = draft.trim() !== q.trim()
  const exact = /^\d+$/.test(q.trim()) ? hits.find((h) => h.row_number === Number(q.trim())) : undefined

  return (
    <main className="grid content-start gap-8 p-4 lg:p-8">
      <header className="grid max-w-[64rem] gap-3">
        <h1 className="font-display text-[1.75rem] leading-9">Trace</h1>
        <p className="font-display text-[1.625rem] leading-10 text-ink">
          Follow any of the {n(snapshotRows)} registry rows from the download, through cleaning and merging, to its startup.
        </p>
      </header>

      <section aria-label="Find a row" className="grid max-w-[48rem] gap-2">
        <label htmlFor="trace-q" className="text-[0.8125rem] font-medium text-ink-2">
          Row number or startup name
        </label>
        <div className="flex h-12 items-center gap-3 rounded-lg border border-edge bg-surface px-4 focus-within:border-ink focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-glaze">
          {pending ? (
            <LoaderCircle className="size-5 shrink-0 animate-spin text-ink-2 motion-reduce:animate-none" aria-hidden />
          ) : (
            <Search className="size-5 shrink-0 text-ink-2" aria-hidden />
          )}
          <input
            id="trace-q"
            type="search"
            autoFocus
            autoComplete="off"
            value={draft}
            placeholder="412, or Garanty"
            onChange={(e) => {
              typed.current = true
              setDraft(e.target.value)
            }}
            onKeyDown={(e) => {
              const target = exact ?? (hits.length === 1 ? hits[0] : undefined)
              if (e.key === 'Enter' && target && !pending) navigate({ to: '/portal/trace/$rowId', params: { rowId: target.id } })
            }}
            className="h-full min-w-0 flex-1 bg-transparent text-[1rem] text-ink outline-none placeholder:text-ink-2"
          />
        </div>
        <p className="text-[0.8125rem] text-ink-2">A number opens that exact registry row. Words match startup names. Enter opens the only match.</p>
      </section>

      <section aria-labelledby="hits-h" className="grid gap-3">
        <h2 id="hits-h" className="font-sans text-[0.9375rem] font-medium text-ink" aria-live="polite">
          {q
            ? total === 0
              ? `No row matches “${q}”`
              : `${hits.length < total ? `${n(hits.length)} of ${n(total)}` : n(total)} ${total === 1 ? 'match' : 'matches'}`
            : `Rows with open findings first · ${n(hits.length)} of ${n(total)} rows`}
        </h2>
        {hits.length > 0 ? (
          <div className="overflow-x-auto rounded-lg border border-edge">
            <div role="table" aria-labelledby="hits-h" className="min-w-[44rem]">
              <div role="row" className="grid grid-cols-[7rem_minmax(0,1fr)_14rem_10rem_10rem_2rem] bg-surface px-4 py-3 text-[0.8125rem] font-medium text-ink-2">
                <span role="columnheader">Row</span>
                <span role="columnheader">Name</span>
                <span role="columnheader">Sector</span>
                <span role="columnheader">Cleaning</span>
                <span role="columnheader">Findings</span>
                <span role="columnheader" className="sr-only">
                  Open
                </span>
              </div>
              {hits.map((h) => (
                <Link
                  key={h.id}
                  role="row"
                  to="/portal/trace/$rowId"
                  params={{ rowId: h.id }}
                  className="group grid grid-cols-[7rem_minmax(0,1fr)_14rem_10rem_10rem_2rem] items-center border-t border-hairline px-4 py-3 text-[0.875rem] text-ink no-underline hover:bg-surface"
                >
                  <span role="cell" className="tabular-nums">
                    Row {h.row_number}
                    {exact?.id === h.id && <span className="ms-2 rounded-sm border border-edge px-1.5 text-[0.8125rem]">exact</span>}
                  </span>
                  <span role="cell" className="truncate font-medium group-hover:underline">
                    {h.name}
                  </span>
                  <span role="cell" className="truncate">
                    {h.sector ?? '—'}
                  </span>
                  <span role="cell" className="tabular-nums">
                    {h.changes ? `${h.changes} ${h.changes === 1 ? 'field' : 'fields'} changed` : 'No change'}
                  </span>
                  <span role="cell" className="tabular-nums">
                    {h.open ? (
                      <span className="border-s-2 border-ochre ps-2">
                        {h.open} open
                      </span>
                    ) : (
                      'None open'
                    )}
                  </span>
                  <span role="cell">
                    <ChevronRight className="size-4 text-ink-2" aria-hidden />
                  </span>
                </Link>
              ))}
            </div>
          </div>
        ) : (
          <p className="max-w-[48rem] rounded-lg border border-edge bg-surface p-4 text-ink">
            Nothing matches. Try part of the name, or the row number from the registry file.
          </p>
        )}
      </section>
    </main>
  )
}
