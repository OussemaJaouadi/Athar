import { Link, createFileRoute, notFound, useRouter } from '@tanstack/react-router'
import { useEffect } from 'react'

import { getRun } from '#/server/api/portal'

export const Route = createFileRoute('/portal/runs/$runId')({
  loader: async ({ params }) => {
    const run = await getRun({ data: params.runId })
    if (!run) throw notFound()
    return run
  },
  component: RunPage,
})

// Macro view: the whole dataset through every step, with counts.
function RunPage() {
  const { run, steps, reviews, sampleRowId } = Route.useLoaderData()
  const router = useRouter()

  // Live steps: refresh while the run is going; a reload reads the same saved state.
  useEffect(() => {
    if (run.status !== 'running') return
    const timer = setInterval(() => router.invalidate(), 1000)
    return () => clearInterval(timer)
  }, [run.status, router])

  return (
    <main className="page">
      <Link to="/portal/runs">All runs</Link>
      <h1>
        {run.operation}{' '}
        <span className="status" data-status={run.status}>
          {run.status}
        </span>
      </h1>
      {run.error && <p className="error">{run.error}</p>}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Step</th>
              <th>Status</th>
              <th>In</th>
              <th>Out</th>
              <th>Time</th>
              <th>What happened</th>
            </tr>
          </thead>
          <tbody>
            {steps.map((s) => (
              <tr key={s.position}>
                <td>{s.step}</td>
                <td>
                  <span className="status" data-status={s.status}>
                    {s.status}
                  </span>
                </td>
                <td>{s.items_in ?? ''}</td>
                <td>{s.items_out ?? ''}</td>
                <td>{s.started_at && s.finished_at ? `${((Date.parse(s.finished_at) - Date.parse(s.started_at)) / 1000).toFixed(1)} s` : ''}</td>
                <td>{s.message}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {reviews.length > 0 && (
        <section className="panel">
          <h2>Review</h2>
          <ul className="list">
            {reviews.map((r) => (
              <li key={r.code}>
                {r.code}: {r.count}
              </li>
            ))}
          </ul>
        </section>
      )}

      {sampleRowId && (
        <Link to="/portal/trace/$rowId" params={{ rowId: sampleRowId }}>
          Trace one row through this run
        </Link>
      )}
    </main>
  )
}
