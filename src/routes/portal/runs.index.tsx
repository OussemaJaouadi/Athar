import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'

import { useLabToaster } from '@/components/athar/lab'
import { Button } from '@/components/ui/button'
import { RunStatus } from '@/components/athar/run-status'
import { listRuns, startOperation } from '#/server/api/portal'

export const Route = createFileRoute('/portal/runs/')({
  loader: () => listRuns(),
  component: RunsPage,
})

const time = (iso: string) => new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })

function RunsPage() {
  const { runs, operations } = Route.useLoaderData()
  const navigate = useNavigate()
  const toaster = useLabToaster()
  const busy = runs.some((r) => r.status === 'running')

  return (
    <main className="grid grid-cols-[minmax(0,1fr)] gap-4 p-4 lg:p-6">
      <h1 className="text-xl font-semibold">Runs</h1>
      <section className="grid gap-px border border-hairline bg-hairline sm:grid-cols-3">
        {operations.map((op, i) => (
          <div key={op.id} className="grid content-between gap-3 bg-canvas p-4">
            <div className="grid gap-1">
              <span className="font-mono text-[0.6875rem] text-ink-2">OP-{String(i + 1).padStart(2, '0')}</span>
              <h2 className="text-base font-semibold">{op.label}</h2>
              <p className="text-ink-2">{op.description}</p>
            </div>
            <div>
              <Button
                disabled={busy}
                onClick={() =>
                  toaster.show(
                    async () => {
                      const { runId } = await startOperation({ data: op.id })
                      navigate({ to: '/portal/runs/$runId', params: { runId } })
                      return runId
                    },
                    {
                      loading: `Starting ${op.label}`,
                      success: [`${op.label} started`, 'Follow it on the island above'],
                      error: (e) => [`${op.label} did not start`, e instanceof Error ? e.message : String(e)],
                    },
                  )
                }
              >
                Run {op.label}
              </Button>
            </div>
          </div>
        ))}
      </section>

      <div className="overflow-x-auto border border-hairline bg-canvas">
        <table className="w-full text-start tabular-nums">
          <thead className="text-ink-2">
            <tr className="border-b border-hairline">
              {['Operation', 'Status', 'Started', 'Finished', 'Error'].map((h) => (
                <th key={h} className="px-3 py-2 text-start font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {runs.map((r) => (
              <tr key={r.id} className="border-b border-hairline last:border-0">
                <td className="px-3 py-2">
                  <Link to="/portal/runs/$runId" params={{ runId: r.id }}>
                    {r.operation}
                  </Link>
                </td>
                <td className="px-3 py-2">
                  <RunStatus status={r.status} />
                </td>
                <td className="px-3 py-2">{time(r.started_at)}</td>
                <td className="px-3 py-2">{r.finished_at ? time(r.finished_at) : ''}</td>
                <td className="px-3 py-2 text-destructive">{r.error}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {runs.length === 0 && <p className="px-3 py-6 text-ink-2">No runs yet. Start with Collect.</p>}
      </div>
    </main>
  )
}
