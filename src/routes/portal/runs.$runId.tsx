import { Link, createFileRoute, notFound, useRouter } from '@tanstack/react-router'
import { useEffect } from 'react'

import { RunStatus } from '@/components/athar/run-status'
import { ValueFlash } from '@/components/interior/value-flash'
import { getRun } from '#/server/api/portal'

export const Route = createFileRoute('/portal/runs/$runId')({
  loader: async ({ params }) => {
    const run = await getRun({ data: params.runId })
    if (!run) throw notFound()
    return run
  },
  component: RunPage,
})

const seconds = (a: string | null, b: string | null) => (a && b ? `${((Date.parse(b) - Date.parse(a)) / 1000).toFixed(1)} s` : '')

// Macro view: the whole snapshot through every step. Counts flash as they change.
function RunPage() {
  const { run, steps, reviews, sampleRowId } = Route.useLoaderData()
  const router = useRouter()

  useEffect(() => {
    if (run.status !== 'running') return
    const timer = setInterval(() => router.invalidate(), 1000)
    return () => clearInterval(timer)
  }, [run.status, router])

  return (
    <main className="mx-auto grid max-w-7xl gap-6 px-5 py-6">
      <Link to="/portal/runs">All runs</Link>
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">{run.operation}</h1>
        <RunStatus status={run.status} />
        <span className="font-mono text-[0.6875rem] text-ink-2">{run.id}</span>
      </header>
      {run.error && <p className="border-s-2 border-destructive ps-3 text-destructive">{run.error}</p>}

      <ol className="grid gap-px border border-hairline bg-hairline md:grid-cols-[repeat(auto-fit,minmax(14rem,1fr))]">
        {steps.map((s) => (
          <li key={s.position} className="grid gap-3 bg-canvas p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-[0.6875rem] text-ink-2">
                STEP {s.position + 1} · {s.step}
              </span>
              <RunStatus status={s.status} />
            </div>
            <div className="flex items-baseline gap-4 font-mono tabular-nums">
              <span className="text-2xl">
                <ValueFlash value={s.items_out ?? 0} label={`${s.step} output`} />
              </span>
              <span className="text-ink-2">from {s.items_in ?? 0}</span>
              <span className="ms-auto text-ink-2">{seconds(s.started_at, s.finished_at)}</span>
            </div>
            <p className="text-ink-2">{s.message ?? '—'}</p>
          </li>
        ))}
      </ol>

      {reviews.length > 0 && (
        <section className="grid gap-2">
          <h2 className="text-base font-semibold">Needs review</h2>
          <ul className="flex flex-wrap gap-2">
            {reviews.map((r) => (
              <li key={r.code} className="rounded-sm border border-hairline bg-canvas px-2 py-1 font-mono text-[0.6875rem]">
                {r.code} <span className="text-ink-2">×{r.count}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {sampleRowId && (
        <Link to="/portal/trace/$rowId" params={{ rowId: sampleRowId }}>
          Trace a row through this run
        </Link>
      )}
    </main>
  )
}
