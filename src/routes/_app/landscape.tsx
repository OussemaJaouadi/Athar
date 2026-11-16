import { Link, createFileRoute } from '@tanstack/react-router'

import { getLandscape } from '#/server/api/app'

export const Route = createFileRoute('/_app/landscape')({
  loader: () => getLandscape(),
  component: LandscapePage,
})

// Landscape: two counts; every number opens the startups behind it.
function LandscapePage() {
  const { byYear, bySector } = Route.useLoaderData()
  const maxYear = Math.max(1, ...byYear.map((y) => y.count))
  const maxSector = Math.max(1, ...bySector.map((s) => s.count))
  return (
    <main className="page">
      <h1>Landscape</h1>
      <div className="split">
        <section className="panel">
          <h2>Startups labelled per year</h2>
          <table>
            <tbody>
              {byYear.map((y) => (
                <tr key={y.year}>
                  <td>{y.year}</td>
                  <td style={{ width: '70%' }}>
                    <div className="bar" style={{ width: `${(y.count / maxYear) * 100}%` }} />
                  </td>
                  <td>{y.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section className="panel">
          <h2>Startups per sector</h2>
          <table>
            <tbody>
              {bySector.map((s) => (
                <tr key={s.sector}>
                  <td>
                    <Link to="/search" search={{ sector: s.sector }}>
                      {s.sector}
                    </Link>
                  </td>
                  <td style={{ width: '40%' }}>
                    <div className="bar" style={{ width: `${(s.count / maxSector) * 100}%` }} />
                  </td>
                  <td>{s.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
      {byYear.length === 0 && <p className="muted">No data yet. An operator runs Collect from the portal.</p>}
    </main>
  )
}
