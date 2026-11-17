import { Link, createFileRoute } from '@tanstack/react-router'

import { PageHeader } from '@/components/athar/kit'
import { ChevronLeft, ChevronRight } from 'lucide-react'

import { labControl } from '@/components/athar/lab'
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
    const data = tables.some((t) => t.name === table)
      ? await getTableRows({ data: { table, page: deps.page } })
      : null
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
  const total = tables.find((t) => t.name === table)?.rows ?? 0
  return (
    <main className="grid grid-cols-[minmax(0,1fr)] gap-4 p-4 lg:p-6">
      <PageHeader title="Database">
        Source rows, cleaned records, startups, runs and keys side by side. Key
        values never leave the server.
      </PageHeader>
      <div className="grid items-start gap-4 lg:grid-cols-[14rem_minmax(0,1fr)]">
        <nav
          aria-label="Tables"
          className="grid border border-edge bg-surface lg:sticky lg:top-4"
        >
          {tables.map((t) => (
            <Link
              key={t.name}
              to="/portal/database"
              search={{ table: t.name }}
              className={cn(
                'grid grid-cols-[1fr_auto] gap-x-2 border-s-2 border-b border-b-hairline min-h-10 px-3 py-2 no-underline last:border-b-0',
                t.name === table
                  ? 'border-s-ink bg-surface-raised font-medium'
                  : 'border-s-transparent hover:bg-surface',
              )}
            >
              <span className="truncate font-mono text-sm text-ink">
                {t.name}
              </span>
              <span className="text-sm text-ink tabular-nums">{t.rows.toLocaleString('en-GB')}</span>
              <span className="text-sm text-ink-2">{SHELF[t.name] ?? ''}</span>
            </Link>
          ))}
        </nav>
        {data && (
          <div className="grid min-w-0 gap-2">
            <div className="max-h-[78dvh] overflow-auto border border-edge bg-surface">
              <table className="w-full tabular-nums">
                <thead className="sticky top-0 bg-surface">
                  <tr>
                    <th className="border-b border-edge px-2.5 py-2 text-start font-mono text-[0.8125rem] font-medium text-ink-2">
                      #
                    </th>
                    {data.columns.map((c) => (
                      <th
                        key={c}
                        className="border-b border-edge px-2.5 py-2 text-start font-mono text-[0.8125rem] font-medium whitespace-nowrap text-ink-2"
                      >
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((r, i) => (
                    <tr
                      key={i}
                      className="border-b border-hairline last:border-0 hover:bg-surface"
                    >
                      <td className="px-2.5 py-1.5 text-[0.8125rem] text-ink-3">
                        {data.page * 50 + i + 1}
                      </td>
                      {data.columns.map((c) => {
                        const v = r[c]
                        const text = v === null ? '' : String(v)
                        return (
                          <td
                            key={c}
                            className={cn(
                              'max-w-72 truncate px-2.5 py-1.5 text-sm',
                              v === null && 'text-ink-2',
                            )}
                            title={text}
                          >
                            {v === null
                              ? 'Empty'
                              : /^[0-9a-f]{8}-[0-9a-f]{4}-/.test(text)
                                ? `…${text.slice(-4)}`
                                : text.length > 80
                                ? `${text.slice(0, 80)}…`
                                : text}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className="me-2 text-ink tabular-nums">
                {data.rows.length ? `${(data.page * 50 + 1).toLocaleString('en-GB')}–${(data.page * 50 + data.rows.length).toLocaleString('en-GB')}` : '0'} of {total.toLocaleString('en-GB')}
              </span>
              <Link
                to="/portal/database"
                search={{ table, page: data.page - 1 || undefined }}
                disabled={data.page === 0}
                aria-disabled={data.page === 0}
                className={cn(labControl, 'inline-flex items-center gap-1.5 no-underline aria-disabled:pointer-events-none aria-disabled:text-ink-3')}
              >
                <ChevronLeft aria-hidden className="size-4" /> Previous
              </Link>
              <Link
                to="/portal/database"
                search={{ table, page: data.page + 1 }}
                disabled={data.rows.length < 50}
                aria-disabled={data.rows.length < 50}
                className={cn(labControl, 'inline-flex items-center gap-1.5 no-underline aria-disabled:pointer-events-none aria-disabled:text-ink-3')}
              >
                Next <ChevronRight aria-hidden className="size-4" />
              </Link>
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
