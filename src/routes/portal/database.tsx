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
    <main className="mx-auto grid max-w-7xl gap-5 px-5 py-6">
      <h1 className="text-xl font-semibold">Database</h1>
      <nav aria-label="Tables" className="flex flex-wrap gap-1.5">
        {tables.map((t) => (
          <Link
            key={t.name}
            to="/portal/database"
            search={{ table: t.name }}
            className={`rounded-sm border px-2 py-1 font-mono text-[0.6875rem] no-underline ${t.name === table ? 'border-ink text-ink' : 'border-hairline text-ink-2 hover:text-ink'}`}
          >
            {t.name} <span className="text-ink-2">{t.rows}</span>
          </Link>
        ))}
      </nav>
      {data && (
        <>
          <div className="overflow-x-auto border border-hairline bg-canvas">
            <table className="w-full tabular-nums">
              <thead>
                <tr>
                  {data.columns.map((c) => (
                    <th key={c} className="border-b border-hairline px-2.5 py-2 text-start font-mono text-[0.6875rem] font-medium whitespace-nowrap text-ink-2">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r, i) => (
                  <tr key={i} className="border-b border-hairline last:border-0">
                    {data.columns.map((c) => {
                      const v = r[c]
                      const text = v === null ? '' : String(v)
                      return (
                        <td key={c} className="max-w-72 truncate px-2.5 py-1.5 font-mono text-xs" title={text}>
                          {text.length > 80 ? `${text.slice(0, 80)}…` : text}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex gap-4">
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
