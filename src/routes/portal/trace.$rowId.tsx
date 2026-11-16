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

// Micro view: one row's isnad, the chain from the registry to the catalogue, step by step.
function TracePage() {
  const { row, changes, startup, siblings, reviews, prepared } = Route.useLoaderData()

  return (
    <main className="grid grid-cols-[minmax(0,1fr)] gap-4 p-4 lg:p-6">
      <header className="grid gap-1">
        <span className="font-mono text-[0.6875rem] text-ink-2">TRACE · registry row {row.row_number}</span>
        <h1 className="text-xl font-semibold">{startup?.name ?? 'Unmatched row'}</h1>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <ol className="relative grid gap-5 ps-7 before:absolute before:inset-y-2 before:start-2 before:w-0.5 before:bg-ochre">
          <Station n={1} title="Collect">
            Snapshot of {new Date(row.fetched_at).toLocaleString('en-GB')} · <span className="font-mono">{row.content_hash.slice(0, 12)}</span>
          </Station>

          <Station n={2} title="Clean">
            {changes.length === 0 ? (
              <span className="text-ink-2">No field changed.</span>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="text-ink-2">
                    <tr className="border-b border-hairline">
                      {['Field', 'Before', 'After', 'Why'].map((h) => (
                        <th key={h} className="py-1.5 pe-3 text-start font-medium">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {changes.map((c) => (
                      <tr key={c.field} className="border-b border-hairline align-top last:border-0">
                        <td className="py-1.5 pe-3 font-mono">{c.field}</td>
                        <td className="max-w-56 py-1.5 pe-3 font-mono break-words text-ink-2 line-through decoration-zinc-400">{c.from ?? '—'}</td>
                        <td className="max-w-56 py-1.5 pe-3 font-mono break-words">{c.to ?? '—'}</td>
                        <td className="py-1.5 text-ink-2">{c.why}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Station>

          <Station n={3} title="Merge">
            {startup ? (
              <>
                Catalogued as{' '}
                <Link to="/startups/$id" params={{ id: startup.id }}>
                  {startup.name}
                </Link>{' '}
                by <span className="font-mono">{startup.identity_key}</span>
                {siblings.length > 0 && <span className="text-ink-2"> · merged with {siblings.length} other row{siblings.length > 1 ? 's' : ''}</span>}
              </>
            ) : (
              <span className="text-ink-2">Not matched yet.</span>
            )}
          </Station>

          <Station n={4} title="Prepare">
            {prepared ? prepared.text : <span className="text-ink-2">Not prepared yet.</span>}
          </Station>

          {reviews.length > 0 && (
            <Station n={5} title="Review">
              <ul className="grid gap-1">
                {reviews.map((r, i) => (
                  <li key={i}>
                    <span className="font-mono">{r.code}</span> <span className="text-ink-2">· {r.message} · {r.status}</span>
                  </li>
                ))}
              </ul>
            </Station>
          )}
        </ol>

        <aside className="grid content-start gap-2">
          <h2 className="font-mono text-[0.6875rem] text-ink-2">AS DOWNLOADED</h2>
          <pre className="overflow-x-auto border border-hairline bg-canvas p-3 font-mono text-xs leading-5 whitespace-pre-wrap">{JSON.stringify(JSON.parse(row.raw_json), null, 2)}</pre>
        </aside>
      </div>
    </main>
  )
}

function Station({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="relative grid gap-2 border border-hairline bg-canvas p-4">
      <span aria-hidden className="absolute top-5 -start-[1.6rem] size-3 rounded-full border-2 border-ochre bg-ochre" />
      <h2 className="font-mono text-[0.6875rem] text-ink-2">
        {String(n).padStart(2, '0')} · {title.toUpperCase()}
      </h2>
      <div>{children}</div>
    </li>
  )
}
