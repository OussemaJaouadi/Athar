import { Link, createFileRoute } from '@tanstack/react-router'

import { PageHeader } from '@/components/athar/kit'
import { cn } from '@/lib/utils'
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
    const table = deps.table ?? 'startups'
    const data = tables.some((t) => t.name === table) ? await getTableRows({ data: { table, page: deps.page } }) : null
    return { tables, table, data }
  },
  component: DatabasePage,
})

// Which step writes each table, so the database reads as the pipeline's shelves.
const SHELF: Record<string, string> = {
  source_snapshots: 'Collect',
  source_rows: 'Collect',
  records: 'Clean',
  startups: 'Merge',
  review_items: 'Clean · Merge',
  prepared_texts: 'Prepare',
  embedding_meta: 'Embed',
  runs: 'Runner',
  run_steps: 'Runner',
  ai_keys: 'Keys',
  ai_usage: 'Keys',
  schema_migrations: 'Setup',
}

// Database view: every table, raw and derived, read-only.
function DatabasePage() {
  const { tables, table, data } = Route.useLoaderData()
  return (
    <main className="grid grid-cols-[minmax(0,1fr)] gap-4 p-4 lg:p-6">
      <PageHeader eyebrow="Database" title="One SQLite file, read-only">
        Raw evidence, derived records, runs and keys side by side. Key values never leave the server.
      </PageHeader>
      <div className="grid items-start gap-4 lg:grid-cols-[14rem_minmax(0,1fr)]">
        <nav aria-label="Tables" className="grid border border-hairline bg-canvas lg:sticky lg:top-4">
          {tables.map((t) => (
            <Link
              key={t.name}
              to="/portal/database"
              search={{ table: t.name }}
              className={cn('grid grid-cols-[1fr_auto] gap-x-2 border-s-2 border-b border-b-hairline px-3 py-2 no-underline last:border-b-0', t.name === table ? 'border-s-ochre bg-surface' : 'border-s-transparent hover:bg-surface')}
            >
              <span className="truncate font-mono text-xs text-ink">{t.name}</span>
              <span className="font-mono text-xs text-ink-2 tabular-nums">{t.rows}</span>
              <span className="text-[0.6875rem] text-ink-2">{SHELF[t.name] ?? ''}</span>
            </Link>
          ))}
        </nav>
        {data && (
          <div className="grid min-w-0 gap-2">
            <div className="max-h-[78dvh] overflow-auto border border-hairline bg-canvas">
              <table className="w-full tabular-nums">
                <thead className="sticky top-0 bg-canvas">
                  <tr>
                    <th className="border-b border-hairline px-2.5 py-2 text-start font-mono text-[0.6875rem] font-medium text-ink-2">#</th>
                    {data.columns.map((c) => (
                      <th key={c} className="border-b border-hairline px-2.5 py-2 text-start font-mono text-[0.6875rem] font-medium whitespace-nowrap text-ink-2">{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((r, i) => (
                    <tr key={i} className="border-b border-hairline last:border-0 hover:bg-surface">
                      <td className="px-2.5 py-1.5 font-mono text-[0.6875rem] text-ink-2">{data.page * 50 + i + 1}</td>
                      {data.columns.map((c) => {
                        const v = r[c]
                        const text = v === null ? '' : String(v)
                        return (
                          <td key={c} className={cn('max-w-72 truncate px-2.5 py-1.5 font-mono text-xs', v === null && 'text-ink-2')} title={text}>
                            {v === null ? 'null' : text.length > 80 ? `${text.slice(0, 80)}…` : text}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center gap-4 text-xs">
              <span className="text-ink-2">page {data.page + 1}</span>
              {data.page > 0 && <Link to="/portal/database" search={{ table, page: data.page - 1 }}>Previous</Link>}
              {data.rows.length === 50 && <Link to="/portal/database" search={{ table, page: data.page + 1 }}>Next</Link>}
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
