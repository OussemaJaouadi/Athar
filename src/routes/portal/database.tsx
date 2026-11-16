import { Link, createFileRoute } from '@tanstack/react-router'

import { getTableRows, listTables } from '#/server/api/portal'

type Search = { table?: string; page?: number }

export const Route = createFileRoute('/portal/database')({
  validateSearch: (s: Record<string, unknown>): Search => ({
    table: typeof s.table === 'string' ? s.table : undefined,
    page: typeof s.page === 'number' && s.page > 0 ? s.page : undefined,
  }),
  loaderDeps: ({ search }) => search,
  loader: async ({ deps }) => {
    const tables = await listTables()
    const table = deps.table ?? tables[0]?.name
    const data = table ? await getTableRows({ data: { table, page: deps.page } }) : null
    return { tables, table, data }
  },
  component: DatabasePage,
})

// Database view: every table, raw and derived, read-only.
function DatabasePage() {
  const { tables, table, data } = Route.useLoaderData()
  return (
    <main className="page">
      <h1>Database</h1>
      <nav className="row" aria-label="Tables">
        {tables.map((t) => (
          <Link key={t.name} to="/portal/database" search={{ table: t.name }}>
            {t.name} ({t.rows})
          </Link>
        ))}
      </nav>
      {data && (
        <>
          <h2>{table}</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  {data.columns.map((c) => (
                    <th key={c}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r, i) => (
                  <tr key={i}>
                    {data.columns.map((c) => {
                      const v = r[c]
                      const text = v === null ? '' : String(v)
                      return (
                        <td key={c} className="mono" title={text}>
                          {text.length > 80 ? `${text.slice(0, 80)}…` : text}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="row">
            {data.page > 0 && (
              <Link to="/portal/database" search={{ table, page: data.page - 1 }}>
                Previous
              </Link>
            )}
            {data.rows.length === 50 && (
              <Link to="/portal/database" search={{ table, page: data.page + 1 }}>
                Next
              </Link>
            )}
          </div>
        </>
      )}
    </main>
  )
}
