import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import {
  labPrimary,
  labTime,
  operationName,
  statusName,
  useLabToaster,
} from '@/components/athar/lab'
import { listKeys, listRuns, startOperation } from '#/server/api/portal'

export const Route = createFileRoute('/portal/runs/')({
  loader: async () => {
    const [data, keys] = await Promise.all([listRuns(), listKeys()])
    return { ...data, hasKey: keys.some((key) => key.status === 'active') }
  },
  component: RunsPage,
})

function RunsPage() {
  const { runs, hasKey } = Route.useLoaderData()
  const navigate = useNavigate()
  const toaster = useLabToaster()
  const [starting, setStarting] = useState(false)
  const busy = starting || runs.some((run) => run.status === 'running')
  return (
    <main className="grid gap-6 p-4 lg:p-6">
      <h1 className="font-display text-[1.75rem] leading-9 font-medium">
        Runs
      </h1>
      <section
        className="grid divide-y divide-hairline border border-hairline bg-surface sm:grid-cols-3 sm:divide-x sm:divide-y-0"
        aria-label="Operations"
      >
        <div className="grid content-start gap-3 p-4">
          <h2 className="text-xl font-medium">Collect</h2>
          <p className="text-ink-2">
            Download the registry, clean source rows and match startups.
          </p>
          <div>
            <button
              className={labPrimary}
              disabled={busy}
              onClick={() => {
                setStarting(true)
                toaster.show(
                  async () => {
                    try {
                      const { runId } = await startOperation({
                        data: 'collect',
                      })
                      await navigate({
                        to: '/portal/runs/$runId',
                        params: { runId },
                      })
                    } finally {
                      setStarting(false)
                    }
                  },
                  {
                    loading: 'Starting Collect',
                    success: [
                      'Collect started',
                      'Open the run to follow its progress.',
                    ],
                    error: (error) => [
                      `Collect failed: ${error instanceof Error ? error.message.replace(/[.\s]+$/, '') : String(error)}.`,
                      'Stored rows are kept. Try Collect again.',
                    ],
                  },
                )
              }}
            >
              {starting ? 'Starting Collect…' : runs.some((r) => r.operation === 'collect' && r.status === 'done') ? 'Collect again' : 'Collect the registry'}
            </button>
          </div>
          {busy && (
            <p className="text-ink-2" role="status">
              A run is starting or running. Wait for it to finish.
            </p>
          )}
        </div>
        <div className="grid content-start gap-3 p-4">
          <h2 className="text-xl font-medium">Prepare</h2>
          <p className="text-ink-2">Clean descriptions with a key.</p>
          <p className="flex min-h-10 items-center rounded-[4px] border border-dashed border-control px-3 text-ink-2">
            Can&apos;t run yet: Prepare is not built.{!hasKey && ' It will also need a key.'}
          </p>
          {!hasKey && (
            <Link to="/portal/keys" className="w-fit text-glaze underline">
              Add a key
            </Link>
          )}
        </div>
        <div className="grid content-start gap-3 p-4">
          <h2 className="text-xl font-medium">Embed</h2>
          <p className="text-ink-2">Prepare startups for similarity search.</p>
          <p className="flex min-h-10 items-center rounded-[4px] border border-dashed border-control px-3 text-ink-2">Can&apos;t run yet: Embed is not built.</p>
        </div>
      </section>
      <section className="overflow-x-auto border border-hairline">
        <table className="w-full tabular-nums">
          <thead className="bg-surface text-ink-2">
            <tr>
              {['Operation', 'Status', 'Started', 'Finished'].map((label) => (
                <th key={label} className="px-4 py-3 text-start font-medium">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {runs.map((run) => (
              <tr key={run.id} className="border-t border-hairline">
                <td className="px-4 py-3">
                  <Link
                    to="/portal/runs/$runId"
                    params={{ runId: run.id }}
                    className="text-glaze underline"
                  >
                    {operationName(run.operation)}
                  </Link>
                </td>
                <td className="px-4 py-3">{statusName(run.status)}</td>
                <td className="px-4 py-3 text-ink-2">
                  {labTime(run.started_at)}
                </td>
                <td className="px-4 py-3 text-ink-2">
                  {run.finished_at ? labTime(run.finished_at) : 'In progress'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!runs.length && (
          <p className="p-4 text-ink-2">No runs yet. Start with Collect.</p>
        )}
      </section>
    </main>
  )
}
