import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { ArrowDown, ArrowUp, ChevronsUpDown, Columns3, Search, TableProperties } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { DbPagination } from '@/components/athar/db-pagination'
import { DbPanel, cellText } from '@/components/athar/db-panel'
import { Scroller } from '@/components/athar/scroller'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { getDbRow, getDbRows, listDbTables, type DbRow } from '#/server/api/database'
import { DB_PAGE_SIZE as PAGE_SIZE } from '#/shared/database'

type Search = { table?: string; q?: string; sort?: string; dir?: 'asc' | 'desc'; page?: number; row?: string }

export const Route = createFileRoute('/portal/database')({
  validateSearch: (s: Record<string, unknown>): Search => ({
    table: typeof s.table === 'string' ? s.table : undefined,
    q: typeof s.q === 'string' && s.q ? s.q : undefined,
    sort: typeof s.sort === 'string' ? s.sort : undefined,
    dir: s.dir === 'desc' ? 'desc' : s.dir === 'asc' ? 'asc' : undefined,
    page: typeof s.page === 'number' && s.page > 1 ? Math.floor(s.page) : undefined,
    row: typeof s.row === 'string' || typeof s.row === 'number' ? String(s.row) : undefined,
  }),
  // The open row is not a loader dependency: opening and closing the panel never refetches the grid.
  loaderDeps: ({ search: { table, q, sort, dir, page } }) => ({ table, q, sort, dir, page }),
  loader: async ({ deps }) => {
    const table = deps.table ?? 'startups'
    const [groups, data] = await Promise.all([listDbTables(), getDbRows({ data: { ...deps, table } })])
    return { groups, table, data }
  },
  component: DatabasePage,
})

const n = (v: number) => v.toLocaleString('en-GB')

// Database: every table as stored, read-only, to settle a doubt.
function DatabasePage() {
  const { groups, table, data } = Route.useLoaderData()
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const go = useCallback(
    (next: Partial<Search>, replace = false) => navigate({ search: (prev: Search) => ({ ...prev, ...next }), replace }),
    [navigate],
  )

  return (
    <main className="grid content-start gap-8 p-4 lg:p-8">
      <header className="grid max-w-[64rem] gap-2">
        <h1 className="font-display text-[1.75rem] leading-9">Database</h1>
        <p className="text-[0.9375rem] leading-6 text-ink">
          Every table as stored, read-only. Open a row to see it in full. Key values never leave the server.
        </p>
      </header>
      <div className="grid items-start gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <TableList groups={groups} current={table} />
        {data ? <Grid key={table} data={data} search={search} go={go} /> : <Unknown table={table} />}
      </div>
    </main>
  )
}

function TableList({ groups, current }: { groups: Awaited<ReturnType<typeof listDbTables>>; current: string }) {
  return (
    <nav aria-label="Tables" className="grid gap-4 rounded-lg border border-edge bg-surface p-3 lg:sticky lg:top-20">
      {groups.map((g) => (
        <section key={g.stage} aria-labelledby={`stage-${g.stage}`} className="grid gap-1">
          <h2 id={`stage-${g.stage}`} className="px-2 font-sans text-[0.8125rem] font-medium text-ink-2">
            {g.stage}
          </h2>
          <ul className="grid gap-0.5">
            {g.tables.map((t) => (
              <li key={t.name}>
                <Link
                  to="/portal/database"
                  search={{ table: t.name }}
                  aria-current={t.name === current ? 'page' : undefined}
                  className={cn(
                    'flex min-h-9 items-center justify-between gap-3 rounded-md px-2 text-ink no-underline hover:bg-surface-raised',
                    t.name === current && 'bg-surface-raised shadow-[inset_2px_0_0_var(--glaze)]',
                  )}
                >
                  <span className="truncate font-mono text-[0.875rem]">{t.name}</span>
                  <span className="text-[0.8125rem] tabular-nums">{n(t.rows)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </nav>
  )
}

function Unknown({ table }: { table: string }) {
  return (
    <section className="grid gap-3 rounded-lg border border-edge bg-surface p-6">
      <p className="font-display text-[1.5rem] leading-8 text-ink">
        There is no table named <span className="font-mono text-[1.25rem]">{table}</span>.
      </p>
      <p className="text-ink">
        Pick one from the list, or{' '}
        <Link to="/portal/database" search={{ table: 'startups' }} className="text-glaze underline">
          open startups
        </Link>
        .
      </p>
    </section>
  )
}

type Data = NonNullable<Awaited<ReturnType<typeof getDbRows>>>

// Hidden columns are a per-viewer convenience: remembered in this browser, per table, harmless when storage is off.
function useHidden(table: string) {
  const key = `athar-db-hidden:${table}`
  const [hidden, setHidden] = useState<string[]>([])
  useEffect(() => {
    try {
      const saved: unknown = JSON.parse(localStorage.getItem(key) ?? '[]')
      setHidden(Array.isArray(saved) ? saved.filter((x): x is string => typeof x === 'string') : [])
    } catch {
      setHidden([])
    }
  }, [key])
  const toggle = (name: string) =>
    setHidden((h) => {
      const next = h.includes(name) ? h.filter((x) => x !== name) : [...h, name]
      try {
        localStorage.setItem(key, JSON.stringify(next))
      } catch {}
      return next
    })
  return [hidden, toggle] as const
}

const MONO = (name: string) => name === 'id' || name.endsWith('_id') || name.endsWith('_json') || name.endsWith('_hash')

function Grid({ data, search, go }: { data: Data; search: Search; go: (next: Partial<Search>, replace?: boolean) => void }) {
  const [hidden, toggle] = useHidden(data.table)
  const columns = useMemo(() => data.columns.filter((c) => !hidden.includes(c.name)), [data.columns, hidden])
  const shown = data.columns.length - data.columns.filter((c) => hidden.includes(c.name)).length
  const [query, setQuery] = useState(data.q)

  // Search as you type, a beat after the last key.
  useEffect(() => {
    if (query.trim() === data.q) return
    const t = setTimeout(() => go({ q: query.trim() || undefined, page: undefined, row: undefined }, true), 300)
    return () => clearTimeout(t)
  }, [query, data.q, go])

  const keyOf = (r: DbRow) => String(r[data.key] ?? r.__rowid)
  const open = search.row
  const fromPage = open ? data.rows.find((r) => keyOf(r) === open) : undefined
  const [fetched, setFetched] = useState<{ key: string; row: DbRow | null } | null>(null)
  // A row opened by link may sit on another page: fetch it on its own.
  useEffect(() => {
    if (!open || fromPage || fetched?.key === open) return
    let live = true
    getDbRow({ data: { table: data.table, key: open } }).then((row) => {
      if (live) setFetched({ key: open, row })
    })
    return () => {
      live = false
    }
  }, [open, fromPage, fetched?.key, data.table])
  const panelRow = fromPage ?? (fetched && fetched.key === open ? fetched.row : null)
  const missing = Boolean(open && !fromPage && fetched && fetched.key === open && !fetched.row)
  const close = useCallback(() => go({ row: undefined }), [go])

  const sortBy = (name: string) => {
    const next = data.sort !== name ? 'asc' : data.dir === 'asc' ? 'desc' : null
    go({ sort: next ? name : undefined, dir: next ?? undefined, page: undefined })
  }

  const first = data.total ? (data.page - 1) * PAGE_SIZE + 1 : 0
  const last = (data.page - 1) * PAGE_SIZE + data.rows.length
  return (
    <section aria-labelledby="table-h" className="grid min-w-0 gap-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <h2 id="table-h" className="flex items-center gap-2 font-sans text-[1.0625rem] font-medium text-ink">
          <TableProperties className="size-4" strokeWidth={1.5} aria-hidden />
          <span className="font-mono">{data.table}</span>
        </h2>
        <p className="text-[0.875rem] text-ink tabular-nums" aria-live="polite">
          {data.q
            ? `${n(data.total)} ${data.total === 1 ? 'row matches' : 'rows match'} “${data.q}”`
            : `${n(data.total)} ${data.total === 1 ? 'row' : 'rows'}`}
        </p>
        <div className="ms-auto flex flex-wrap items-center gap-2">
          <label className="relative flex items-center">
            <span className="sr-only">Search {data.table}</span>
            <Search className="pointer-events-none absolute start-3 size-4 text-ink-2" aria-hidden />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${data.table}`}
              className="h-9 w-72 max-w-full rounded-md border border-edge bg-surface ps-9 pe-3 text-[0.875rem] text-ink placeholder:text-ink-2"
            />
          </label>
          <Popover>
            <PopoverTrigger className="inline-flex h-9 items-center gap-2 rounded-md border border-edge px-3 text-[0.875rem] text-ink hover:bg-surface-raised">
              <Columns3 className="size-4" aria-hidden />
              Columns
              {shown < data.columns.length && (
                <span className="tabular-nums">
                  · {shown} of {data.columns.length}
                </span>
              )}
            </PopoverTrigger>
            <PopoverContent align="end" className="w-64 border border-edge bg-surface-raised p-2 text-ink ring-0">
              <fieldset className="grid gap-0.5">
                <legend className="px-2 pb-1 text-[0.8125rem] text-ink-2">Show columns</legend>
                {data.columns.map((c) => (
                  <label key={c.name} className="flex min-h-8 cursor-pointer items-center gap-2.5 rounded-md px-2 hover:bg-surface">
                    <input type="checkbox" checked={!hidden.includes(c.name)} onChange={() => toggle(c.name)} className="size-4 accent-[var(--glaze)]" />
                    <span className="font-mono text-[0.8125rem]">{c.name}</span>
                  </label>
                ))}
              </fieldset>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {data.rows.length === 0 ? (
        <div className="rounded-lg border border-edge bg-surface p-6 text-ink">
          {data.q ? (
            <p>
              Nothing in <span className="font-mono">{data.table}</span> matches “{data.q}”.{' '}
              <button type="button" className="text-glaze underline" onClick={() => setQuery('')}>
                Clear the search
              </button>
            </p>
          ) : (
            <p>This table is empty.</p>
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-edge">
          <Scroller axis="both" className="max-h-[calc(100dvh-17rem)]" label={`${data.table} rows`}>
            <table className="w-max min-w-full text-[0.875rem]">
              <thead className="sticky top-0 z-10 bg-surface shadow-[inset_0_-1px_0_var(--edge)]">
                <tr>
                  <th scope="col" className="px-3 py-2.5 text-end text-[0.8125rem] font-medium text-ink-2">
                    #
                  </th>
                  {columns.map((c) => {
                    const sorted = data.sort === c.name ? data.dir : null
                    const Icon = sorted === 'asc' ? ArrowUp : sorted === 'desc' ? ArrowDown : ChevronsUpDown
                    return (
                      <th
                        key={c.name}
                        scope="col"
                        aria-sort={sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : 'none'}
                        className="px-1 py-1.5 text-start"
                      >
                        <button
                          type="button"
                          onClick={() => sortBy(c.name)}
                          className={cn(
                            'inline-flex h-8 items-center gap-1.5 rounded-md px-2 font-mono text-[0.8125rem] font-medium whitespace-nowrap hover:bg-surface-raised',
                            sorted ? 'text-ink' : 'text-ink-2',
                          )}
                        >
                          {c.name}
                          <Icon className="size-3.5" aria-hidden />
                        </button>
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r, i) => {
                  const k = keyOf(r)
                  return (
                    <tr
                      key={k}
                      onClick={() => go({ row: k })}
                      className={cn(
                        'cursor-pointer border-t border-hairline hover:bg-surface-raised',
                        k === open && 'bg-surface-raised shadow-[inset_2px_0_0_var(--glaze)]',
                      )}
                    >
                      <td className="px-3 py-2 text-end">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            go({ row: k })
                          }}
                          aria-label={`Open row ${first + i} in full`}
                          className="rounded-sm px-1 text-[0.8125rem] text-ink tabular-nums underline-offset-4 hover:underline"
                        >
                          {first + i}
                        </button>
                      </td>
                      {columns.map((c) => {
                        const v = r[c.name] ?? null
                        return (
                          <td
                            key={c.name}
                            className={cn(
                              'max-w-[26rem] truncate px-3 py-2 text-ink',
                              typeof v === 'number' && 'text-end tabular-nums',
                              MONO(c.name) && 'font-mono text-[0.8125rem]',
                            )}
                          >
                            {cellText(c, v)}
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </Scroller>
        </div>
      )}

      {data.total > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[0.875rem] text-ink tabular-nums">
            {n(first)}–{n(last)} of {n(data.total)}
          </p>
          <DbPagination page={data.page} pages={data.pages} onPage={(page) => go({ page: page > 1 ? page : undefined })} />
        </div>
      )}

      {open && <DbPanel table={data.table} columns={data.columns} row={panelRow} missing={missing} rowKey={open} onClose={close} />}
    </section>
  )
}
