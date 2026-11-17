import { Link, createFileRoute, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import {
  findingName,
  findingSentence,
  labControl,
  labPrimary,
  useLabToaster,
} from '@/components/athar/lab'
import { PageHeader } from '@/components/athar/kit'
import { listReviews, setReviewStatus } from '#/server/api/portal'

type Search = { status?: string; code?: string }
export const Route = createFileRoute('/portal/review')({
  validateSearch: (s: Record<string, unknown>): Search => ({
    status: ['open', 'resolved', 'dismissed'].includes(String(s.status))
      ? String(s.status)
      : undefined,
    code: typeof s.code === 'string' ? s.code : undefined,
  }),
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => listReviews({ data: deps }),
  component: ReviewPage,
})
const labels = {
  open: 'Open',
  resolved: 'Resolved',
  dismissed: 'Dismissed',
} as const

function ReviewPage() {
  const { items, counts, status, code } = Route.useLoaderData()
  const router = useRouter()
  const toaster = useLabToaster()
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)
  const groups = [...new Set(items.map((item) => item.code))]
  const selected = items.filter((item) => picked.has(item.id))
  const act = (next: 'resolved' | 'dismissed' | 'open') => {
    setSaving(true)
    toaster.show(
      async () => {
        try {
          await setReviewStatus({
            data: { ids: selected.map((item) => item.id), status: next },
          })
          setPicked(new Set())
          await router.invalidate()
        } finally {
          setSaving(false)
        }
      },
      {
        loading: 'Updating findings',
        success: ['Findings updated', 'The review list is updated.'],
        error: (error) => ['Changes could not be saved', String(error)],
      },
    )
  }
  return (
    <main className="grid gap-6 p-4 lg:p-6">
      <PageHeader title="In review">
        Each record is listed under its finding. A name opens the trace of its source row.
      </PageHeader>
      <div className="flex flex-wrap items-center gap-3">
        <nav aria-label="Finding status" className="flex flex-wrap gap-2">
          {(Object.keys(labels) as Array<keyof typeof labels>).map((value) => (
            <Link
              key={value}
              to="/portal/review"
              search={{ status: value, code }}
              aria-current={status === value ? 'page' : undefined}
              onClick={() => setPicked(new Set())}
              className={`${labControl} inline-flex items-center gap-2 no-underline ${status === value ? 'border-2 border-ink font-medium text-ink' : 'border-edge text-ink'}`}
            >
              {labels[value]}
              <span className="tabular-nums">
                {counts
                  .filter(
                    (c) => c.status === value && (!code || c.code === code),
                  )
                  .reduce((total, c) => total + c.count, 0)}
              </span>
            </Link>
          ))}
        </nav>
        {code && (
          <Link
            to="/portal/review"
            search={{ status }}
            className="text-glaze underline"
          >
            Show all findings
          </Link>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-3 border-y border-edge py-3">
        <label className="flex min-h-10 items-center gap-2">
          <input
            type="checkbox"
            className="size-4 accent-glaze"
            checked={items.length > 0 && selected.length === items.length}
            onChange={(event) =>
              setPicked(
                event.target.checked
                  ? new Set(items.map((item) => item.id))
                  : new Set(),
              )
            }
          />
          Select all
        </label>
        <span className="text-ink tabular-nums">{selected.length} selected</span>
        <div className="ms-auto flex flex-wrap gap-2">
          {status === 'open' ? (
            <>
              <button
                className={labControl}
                disabled={!selected.length || saving}
                onClick={() => act('dismissed')}
              >
                Dismiss findings
              </button>
              <button
                className={labPrimary}
                disabled={!selected.length || saving}
                onClick={() => act('resolved')}
              >
                Resolve findings
              </button>
            </>
          ) : (
            <button
              className={labControl}
              disabled={!selected.length || saving}
              onClick={() => act('open')}
            >
              Reopen findings
            </button>
          )}
        </div>
      </div>
      {groups.map((finding) => {
        const rows = items.filter((item) => item.code === finding)
        return (
          <section key={finding}>
            <div className="mb-3">
              <h2 className="font-sans text-[0.9375rem] font-medium text-ink">
                {findingName(finding)}{' '}
                <span className="ms-2 font-normal text-ink-2 tabular-nums">
                  {rows.length} {rows.length === 1 ? 'finding' : 'findings'}
                </span>
              </h2>
              <p className="mt-1 text-ink">{findingSentence(finding)}</p>
            </div>
            <ul className="divide-y divide-hairline border-y border-edge">
              {rows.map((item) => (
                <li
                  key={item.id}
                  className={`grid grid-cols-[2.5rem_minmax(0,1fr)] gap-x-2 px-1 py-0.5 sm:grid-cols-[2.5rem_5rem_16rem_minmax(0,1fr)] sm:items-center ${picked.has(item.id) ? 'bg-surface' : ''}`}
                >
                  <label className="row-span-3 flex min-h-10 items-center justify-center sm:row-span-1">
                    <input
                      type="checkbox"
                      aria-label={`Select source row ${item.row_number ?? item.name ?? 'without a number'}`}
                      className="size-4 accent-glaze"
                      checked={picked.has(item.id)}
                      onChange={(event) =>
                        setPicked((previous) => {
                          const next = new Set(previous)
                          if (event.target.checked) next.add(item.id)
                          else next.delete(item.id)
                          return next
                        })
                      }
                    />
                  </label>
                  <span className="font-mono text-[0.8125rem] tabular-nums text-ink-2">
                    {item.row_number !== null
                      ? `Row ${item.row_number}`
                      : 'No source row'}
                  </span>
                  {item.source_row_id ? (
                    <Link to="/portal/trace/$rowId" params={{ rowId: item.source_row_id }} className="truncate text-glaze underline" title="Trace this source row">
                      {item.name || 'Unnamed startup'}
                    </Link>
                  ) : (
                    <span className="truncate">{item.name || 'Startup not matched yet'}</span>
                  )}
                  <span className="truncate pb-2 text-sm text-ink sm:pb-0">
                    {item.code === 'website_unrepairable'
                      ? <>Registry wrote <span className="font-mono text-ink">{item.raw_website ?? 'nothing'}</span></>
                      : [item.sector, item.cohort && `labelled ${item.cohort.slice(3)}`].filter(Boolean).join(' · ') || 'No sector in the registry'}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )
      })}
      {!items.length && (
        <p className="py-6 text-ink">
          No{' '}
          {status === 'open'
            ? 'open'
            : status === 'resolved'
              ? 'resolved'
              : 'dismissed'}{' '}
          findings.
        </p>
      )}
    </main>
  )
}
