import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'

import { listRuns, startOperation } from '#/server/api/portal'

export const Route = createFileRoute('/portal/runs/')({
  loader: () => listRuns(),
  component: RunsPage,
})

function RunsPage() {
  const { runs, operations } = Route.useLoaderData()
  const navigate = useNavigate()
  const [error, setError] = useState<string>()
  const busy = runs.some((r) => r.status === 'running')

  return (
    <main className="page">
      <h1>Runs</h1>
      <section className="row">
        {operations.map((op) => (
          <div key={op.id} className="panel" style={{ flex: '1 1 16rem' }}>
            <h2>{op.label}</h2>
            <p className="muted">{op.description}</p>
            <button
              className="btn"
              disabled={busy}
              onClick={async () => {
                setError(undefined)
                try {
                  const { runId } = await startOperation({ data: op.id })
                  navigate({ to: '/portal/runs/$runId', params: { runId } })
                } catch (e) {
                  setError(e instanceof Error ? e.message : String(e))
                }
              }}
            >
              Run {op.label}
            </button>
          </div>
        ))}
      </section>
      {error && <p className="error">{error}</p>}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Operation</th>
              <th>Status</th>
              <th>Started</th>
              <th>Finished</th>
              <th>Error</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((r) => (
              <tr key={r.id}>
                <td>
                  <Link to="/portal/runs/$runId" params={{ runId: r.id }}>
                    {r.operation}
                  </Link>
                </td>
                <td>
                  <span className="status" data-status={r.status}>
                    {r.status}
                  </span>
                </td>
                <td>{new Date(r.started_at).toLocaleString()}</td>
                <td>{r.finished_at ? new Date(r.finished_at).toLocaleString() : ''}</td>
                <td>{r.error}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {runs.length === 0 && <p className="muted">No runs yet. Start with Collect.</p>}
      </div>
    </main>
  )
}
