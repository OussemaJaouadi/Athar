import { Link, createFileRoute, notFound } from '@tanstack/react-router'

import { getStartup } from '#/server/api/app'

export const Route = createFileRoute('/_app/startups/$id')({
  loader: async ({ params }) => {
    const result = await getStartup({ data: params.id })
    if (!result) throw notFound()
    return result
  },
  component: ProfilePage,
})

// Profile: every field opens the registry row it came from.
function ProfilePage() {
  const { startup, sources } = Route.useLoaderData()
  const fields: [string, React.ReactNode][] = [
    ['Description', startup.description],
    ['Sector', startup.sector],
    ['Website', startup.website && <a href={startup.website}>{startup.website}</a>],
    ['Founders', startup.founders.length ? startup.founders.join(', ') : null],
    ['Cohort', startup.cohort],
    ['Created', startup.creation_year],
  ]

  return (
    <main className="page">
      <Link to="/search">Back to search</Link>
      <h1>{startup.name}</h1>
      <dl className="list">
        {fields.map(([label, value]) => (
          <div key={label}>
            <dt className="muted">{label}</dt>
            <dd style={{ margin: 0 }}>{value ?? <span className="muted">Not in the registry</span>}</dd>
          </div>
        ))}
      </dl>

      <section className="panel">
        <h2>Sources</h2>
        <ul className="list">
          {sources.map((s) => (
            <li key={s.source_row_id}>
              Registry row {s.row_number}, collected {new Date(s.fetched_at).toLocaleDateString()}
              <details>
                <summary>Show the row as published</summary>
                <pre className="mono">{JSON.stringify(JSON.parse(s.raw_json), null, 2)}</pre>
              </details>
            </li>
          ))}
        </ul>
      </section>

      <section className="panel">
        <h2>Similar startups</h2>
        <p className="muted">Appears after an operator runs Embed.</p>
      </section>
    </main>
  )
}
