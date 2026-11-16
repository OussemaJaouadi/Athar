import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'

import { searchStartups } from '#/server/api/app'

type Search = { q?: string; sector?: string }

export const Route = createFileRoute('/_app/search')({
  validateSearch: (s: Record<string, unknown>): Search => ({
    q: typeof s.q === 'string' && s.q ? s.q : undefined,
    sector: typeof s.sector === 'string' && s.sector ? s.sector : undefined,
  }),
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => searchStartups({ data: deps }),
  component: SearchPage,
})

// Search: filters and full text now; natural language and semantic search after Embed.
function SearchPage() {
  const { rows, sectors, total } = Route.useLoaderData()
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })

  return (
    <main className="page">
      <h1>Search</h1>
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault()
          const form = new FormData(e.currentTarget)
          navigate({ search: { q: String(form.get('q') ?? '') || undefined, sector: String(form.get('sector') ?? '') || undefined } })
        }}
      >
        <input className="field" name="q" defaultValue={search.q} placeholder="Name, description or sector" aria-label="Search" />
        <select className="field" name="sector" defaultValue={search.sector ?? ''} aria-label="Sector">
          <option value="">All sectors</option>
          {sectors.map((s) => (
            <option key={s.sector} value={s.sector}>
              {s.sector} ({s.count})
            </option>
          ))}
        </select>
        <button className="btn" type="submit">
          Search
        </button>
      </form>

      {total === 0 ? (
        <p className="muted">No startups yet. An operator runs Collect from the portal to load the registry.</p>
      ) : (
        <>
          <p className="muted">
            {rows.length} of {total} startups
          </p>
          <ul className="list">
            {rows.map((s) => (
              <li key={s.id}>
                <Link to="/startups/$id" params={{ id: s.id }}>
                  <strong>{s.name}</strong>
                </Link>
                <div className="muted">
                  {[s.sector, s.creation_year && `created ${s.creation_year}`, s.cohort && `cohort ${s.cohort}`].filter(Boolean).join(' · ')}
                </div>
                {s.description && <p>{s.description}</p>}
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  )
}
