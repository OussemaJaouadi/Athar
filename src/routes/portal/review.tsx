import { Link, createFileRoute, useRouter } from '@tanstack/react-router'
import { useState } from 'react'

import { useLabToaster } from '@/components/athar/lab'
import { PageHeader } from '@/components/athar/kit'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { listReviews, setReviewStatus } from '#/server/api/portal'

type Search = { status?: string; code?: string }

export const Route = createFileRoute('/portal/review')({
  validateSearch: (s: Record<string, unknown>): Search => ({
    status: typeof s.status === 'string' ? s.status : undefined,
    code: typeof s.code === 'string' ? s.code : undefined,
  }),
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => listReviews({ data: deps }),
  component: ReviewPage,
})

const STATUSES = ['open', 'resolved', 'dismissed'] as const

// The review queue: what Clean and Merge could not settle alone. Resolve or dismiss in bulk.
function ReviewPage() {
  const { items, counts, status, code } = Route.useLoaderData()
  const router = useRouter()
  const toaster = useLabToaster()
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const codes = [...new Set(counts.map((c) => c.code))]
  const count = (s: string, c?: string) => counts.filter((x) => x.status === s && (!c || x.code === c)).reduce((a, b) => a + b.count, 0)

  const act = (next: 'resolved' | 'dismissed' | 'open') => {
    const ids = [...picked]
    toaster.show(
      async () => {
        await setReviewStatus({ data: { ids, status: next } })
        setPicked(new Set())
        await router.invalidate()
      },
      { loading: `Marking ${ids.length} as ${next}`, success: [`${ids.length} marked ${next}`, 'The queue is updated'], error: (e) => ['Not saved', String(e)] },
    )
  }

  return (
    <main className="grid grid-cols-[minmax(0,1fr)] gap-4 p-4 lg:p-6">
      <PageHeader eyebrow="Review queue" title="What the pipeline could not settle alone">
        Missing descriptions stay as missing tiles in the reading room; an unrepairable website stays out of the condition checks.
      </PageHeader>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex border border-hairline bg-canvas p-0.5">
          {STATUSES.map((s) => (
            <Link key={s} to="/portal/review" search={{ status: s, code }} className={cn('rounded-sm px-2.5 py-1 no-underline', s === status ? 'bg-surface-raised text-ink' : 'text-ink-2')}>
              {s} <span className="font-mono text-[0.6875rem]">{count(s, code || undefined)}</span>
            </Link>
          ))}
        </div>
        <div className="flex flex-wrap gap-1">
          <Link to="/portal/review" search={{ status }} className={cn('rounded-sm border px-2 py-1 font-mono text-[0.6875rem] no-underline', !code ? 'border-ink text-ink' : 'border-hairline text-ink-2')}>
            all codes
          </Link>
          {codes.map((c) => (
            <Link key={c} to="/portal/review" search={{ status, code: c }} className={cn('rounded-sm border px-2 py-1 font-mono text-[0.6875rem] no-underline', code === c ? 'border-ink text-ink' : 'border-hairline text-ink-2')}>
              {c} {count(status, c)}
            </Link>
          ))}
        </div>
        <div className="ms-auto flex items-center gap-2">
          <span className="text-xs text-ink-2">{picked.size} selected</span>
          {status === 'open' ? (
            <>
              <Button size="sm" variant="outline" disabled={!picked.size} onClick={() => act('dismissed')}>Dismiss</Button>
              <Button size="sm" disabled={!picked.size} onClick={() => act('resolved')}>Mark resolved</Button>
            </>
          ) : (
            <Button size="sm" variant="outline" disabled={!picked.size} onClick={() => act('open')}>Reopen</Button>
          )}
        </div>
      </div>

      <div className="overflow-x-auto border border-hairline bg-canvas">
        <table className="w-full">
          <thead className="text-ink-2">
            <tr className="border-b border-hairline">
              <th className="w-8 px-3 py-2">
                <input
                  type="checkbox"
                  aria-label="Select all"
                  checked={items.length > 0 && picked.size === items.length}
                  onChange={(e) => setPicked(e.target.checked ? new Set(items.map((i) => i.id)) : new Set())}
                />
              </th>
              {['Row', 'Startup', 'Step', 'Code', 'What happened', ''].map((h) => (
                <th key={h} className="px-3 py-2 text-start font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.id} className={cn('border-b border-hairline last:border-0', picked.has(i.id) && 'bg-surface')}>
                <td className="px-3 py-1.5">
                  <input
                    type="checkbox"
                    aria-label={`Select row ${i.row_number}`}
                    checked={picked.has(i.id)}
                    onChange={(e) => setPicked((p) => { const n = new Set(p); if (e.target.checked) n.add(i.id); else n.delete(i.id); return n })}
                  />
                </td>
                <td className="px-3 py-1.5 font-mono text-xs tabular-nums">{i.row_number ?? '—'}</td>
                <td className="px-3 py-1.5">{i.startup_id ? <Link to="/startups/$id" params={{ id: i.startup_id }}>{i.name}</Link> : <span className="text-ink-2">—</span>}</td>
                <td className="px-3 py-1.5 font-mono text-xs">{i.step}</td>
                <td className="px-3 py-1.5 font-mono text-xs text-ochre-text">{i.code}</td>
                <td className="px-3 py-1.5 text-ink-2">{i.message}</td>
                <td className="px-3 py-1.5 text-end">
                  {i.source_row_id && (
                    <Link to="/portal/trace/$rowId" params={{ rowId: i.source_row_id }} className="text-xs">trace</Link>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {items.length === 0 && <p className="px-3 py-8 text-center text-ink-2">Nothing {status} here.</p>}
      </div>
    </main>
  )
}
