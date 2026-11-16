import { Link, createFileRoute, notFound } from '@tanstack/react-router'

import { getTrace } from '#/server/api/portal'

export const Route = createFileRoute('/portal/trace/$rowId')({
  loader: async ({ params }) => {
    const trace = await getTrace({ data: params.rowId })
    if (!trace) throw notFound()
    return trace
  },
  component: TracePage,
})

const show = (v: string | null) => v ?? '—'

// Micro view: one registry row, what each step did to it, and why.
function TracePage() {
  const { row, changes, startup, siblings, reviews, prepared } = Route.useLoaderData()
  return (
    <main className="page">
      <h1>Row {row.row_number}</h1>
      <div className="split">
        <section className="list">
          <div className="panel">
            <h2>Collect</h2>
            <p>
              Snapshot of {new Date(row.fetched_at).toLocaleString()} · <span className="mono">{row.content_hash.slice(0, 12)}</span>
            </p>
          </div>

          <div className="panel">
            <h2>Clean</h2>
            {changes.length === 0 ? (
              <p className="muted">No field changed.</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Field</th>
                    <th>Before</th>
                    <th>After</th>
                    <th>Why</th>
                  </tr>
                </thead>
                <tbody>
                  {changes.map((c) => (
                    <tr key={c.field}>
                      <td>{c.field}</td>
                      <td className="mono">{show(c.from)}</td>
                      <td className="mono">{show(c.to)}</td>
                      <td>{c.why}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="panel">
            <h2>Merge</h2>
            {startup ? (
              <p>
                Startup{' '}
                <Link to="/startups/$id" params={{ id: startup.id }}>
                  {startup.name}
                </Link>{' '}
                by <span className="mono">{startup.identity_key}</span>
                {siblings.length > 0 && ` · merged with ${siblings.length} other row(s)`}
              </p>
            ) : (
              <p className="muted">Not matched yet.</p>
            )}
          </div>

          <div className="panel">
            <h2>Prepare</h2>
            {prepared ? <p>{prepared.text}</p> : <p className="muted">Not prepared yet.</p>}
          </div>

          {reviews.length > 0 && (
            <div className="panel">
              <h2>Review</h2>
              <ul className="list">
                {reviews.map((r, i) => (
                  <li key={i}>
                    {r.step} · {r.code}: {r.message} ({r.status})
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <section className="panel">
          <h2>As downloaded</h2>
          <pre className="mono">{JSON.stringify(JSON.parse(row.raw_json), null, 2)}</pre>
        </section>
      </div>
    </main>
  )
}
