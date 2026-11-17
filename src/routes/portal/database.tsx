import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { ArrowDown, ArrowUp, ChevronsUpDown, Columns3, Search } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { DbPagination } from '@/components/athar/db-pagination'
import { DbDrawer, cellText, humanize, isMono, tableName } from '@/components/athar/db-panel'
import { OpsPage, opsButton, opsControl, opsTd, opsTh, useListStepper } from '@/components/athar/ops'
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
  // The open row is not a loader dependency: opening and closing the drawer never refetches the grid.
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
    <OpsPage title="Database" lede="Every table as stored, read-only. Key values never leave the server.">
      <div className="grid items-start gap-6 lg:grid-cols-[13rem_minmax(0,1fr)]">
        <TableList groups={groups} current={table} />
        {data ? <Grid key={table} data={data} search={search} go={go} /> : <Unknown table={table} />}
      </div>
    </OpsPage>
  )
}

function TableList({ groups, current }: { groups: Awaited<ReturnType<typeof listDbTables>>; current: string }) {
  return (
    <nav aria-label="Tables" className="grid gap-3 lg:sticky lg:top-20">
      {groups.map((g) => (
        <section key={g.stage} aria-labelledby={`stage-${g.stage}`} className="grid gap-0.5">
          <h2 id={`stage-${g.stage}`} className="px-2 pb-0.5 font-sans text-[0.8125rem] font-normal text-ink-2">
            {g.stage}
          </h2>
          <ul className="grid">
            {g.tables.map((t) => {
              const active = t.name === current
              return (
                <li key={t.name}>
                  <Link
                    to="/portal/database"
                    search={{ table: t.name }}
                    title={t.name}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'flex h-8 items-center justify-between gap-3 rounded-md px-2 text-[0.8125rem] text-ink no-underline hover:bg-surface-raised',
                      active && 'bg-surface-raised font-medium',
                    )}
                  >
                    <span className="truncate">{tableName(t.name)}</span>
                    <span className="font-normal text-ink-2 tabular-nums">{n(t.rows)}</span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </nav>
  )
}

function Unknown({ table }: { table: string }) {
  return (
    <section className="grid gap-1 rounded-md border border-edge p-4 text-[0.875rem] text-ink">
      <p>
        There is no table named <span className="font-mono">{table}</span>.
      </p>
      <p>
        Pick one from the list, or{' '}
        <Link to="/portal/database" search={{ table: 'startups' }} className="text-glaze underline">
          open Startups
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

function Grid({ data, search, go }: { data: Data; search: Search; go: (next: Partial<Search>, replace?: boolean) => void }) {
  const [hidden, toggle] = useHidden(data.table)
  const columns = useMemo(() => data.columns.filter((c) => !hidden.includes(c.name)), [data.columns, hidden])
  const shown = columns.length
  const [query, setQuery] = useState(data.q)

  // Search as you type, a beat after the last key.
  useEffect(() => {
    if (query.trim() === data.q) return
    const t = setTimeout(() => go({ q: query.trim() || undefined, page: undefined, row: undefined }, true), 300)
    return () => clearTimeout(t)
  }, [query, data.q, go])

  const keyOf = useCallback((r: DbRow) => String(r[data.key] ?? r.__rowid), [data.key])
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
  const drawerRow = fromPage ?? (fetched && fetched.key === open ? fetched.row : null)
  const missing = Boolean(open && !fromPage && fetched && fetched.key === open && !fetched.row)
  const close = useCallback(() => go({ row: undefined }), [go])

  const ids = useMemo(() => data.rows.map(keyOf), [data.rows, keyOf])
  const step = useCallback((id: string) => go({ row: id }, true), [go])
  useListStepper(ids, open, step)

  const sortBy = (name: string) => {
    const next = data.sort !== name ? 'asc' : data.dir === 'asc' ? 'desc' : null
    go({ sort: next ? name : undefined, dir: next ?? undefined, page: undefined })
  }

  const first = data.total ? (data.page - 1) * PAGE_SIZE + 1 : 0
  const last = (data.page - 1) * PAGE_SIZE + data.rows.length
  const name = tableName(data.table)
  return (
    <section aria-label={name} className="grid min-w-0 gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative flex items-center">
          <span className="sr-only">Search {name}</span>
          <Search className="pointer-events-none absolute start-2.5 size-3.5 text-ink-2" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${name.toLowerCase()}`}
            className={cn(opsControl, 'w-64 max-w-full ps-8')}
          />
        </label>
        <Popover>
          <PopoverTrigger className={opsButton}>
            <Columns3 aria-hidden />
            Columns
            {shown < data.columns.length && (
              <span className="font-normal tabular-nums">
                {shown} of {data.columns.length}
              </span>
            )}
          </PopoverTrigger>
          <PopoverContent align="start" className="w-60 border border-edge bg-surface-raised p-1.5 text-ink ring-0">
            <fieldset className="grid">
              <legend className="px-2 pb-1 text-[0.8125rem] text-ink-2">Show columns</legend>
              {data.columns.map((c) => (
                <label key={c.name} title={c.name} className="flex h-8 cursor-pointer items-center gap-2 rounded px-2 text-[0.8125rem] hover:bg-surface">
                  <input type="checkbox" checked={!hidden.includes(c.name)} onChange={() => toggle(c.name)} className="size-3.5 accent-[var(--glaze)]" />
                  {humanize(c.name)}
                </label>
              ))}
            </fieldset>
          </PopoverContent>
        </Popover>
        <p className="ms-auto text-[0.8125rem] text-ink-2 tabular-nums" aria-live="polite">
          {data.total === 0
            ? data.q
              ? 'No matches'
              : 'Empty'
            : `${n(first)}–${n(last)} of ${n(data.total)}${data.q ? ` matching “${data.q}”` : ''}`}
        </p>
      </div>

      {data.rows.length === 0 ? (
        <p className="rounded-md border border-edge px-3 py-4 text-[0.8125rem] text-ink">
          {data.q ? (
            <>
              Nothing in {name} matches “{data.q}”.{' '}
              <button type="button" className="text-glaze underline" onClick={() => setQuery('')}>
                Clear the search
              </button>
            </>
          ) : (
            'This table is empty.'
          )}
        </p>
      ) : (
        <div className="overflow-hidden rounded-md border border-edge">
          <Scroller axis="both" className="max-h-[calc(100dvh-15rem)]" label={`${name} rows`}>
            <table className="w-max min-w-full">
              <thead className="sticky top-0 z-10 bg-surface shadow-[inset_0_-1px_0_var(--hairline)]">
                <tr>
                  <th scope="col" className={cn(opsTh, 'w-12 text-end')}>
                    #
                  </th>
                  {columns.map((c) => {
                    const sorted = data.sort === c.name ? data.dir : null
                    const Icon = sorted === 'asc' ? ArrowUp : sorted === 'desc' ? ArrowDown : ChevronsUpDown
                    return (
                      <th
                        key={c.name}
                        scope="col"
                        title={c.name}
                        aria-sort={sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : 'none'}
                        className="h-9 px-1 text-start"
                      >
                        <button
                          type="button"
                          onClick={() => sortBy(c.name)}
                          className={cn(
                            'group inline-flex h-7 items-center gap-1 rounded px-2 text-[0.8125rem] font-medium whitespace-nowrap hover:bg-surface-raised',
                            sorted ? 'text-ink' : 'text-ink-2',
                          )}
                        >
                          {humanize(c.name)}
                          <Icon className={cn('size-3', !sorted && 'opacity-0 group-hover:opacity-100')} aria-hidden />
                        </button>
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r, i) => {
                  const k = keyOf(r)
                  const active = k === open
                  return (
                    <tr
                      key={k}
                      onClick={() => go({ row: k }, Boolean(open))}
                      aria-selected={active}
                      className={cn('cursor-pointer border-t border-hairline hover:bg-surface-raised/70', active && 'bg-surface-raised')}
                    >
                      <td className={cn(opsTd, 'text-end')}>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            go({ row: k }, Boolean(open))
                          }}
                          aria-label={`Open row ${first + i}`}
                          className="rounded-sm text-ink-2 tabular-nums hover:text-ink"
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
                              opsTd,
                              'max-w-[24rem] truncate',
                              typeof v === 'number' && 'text-end tabular-nums',
                              isMono(c.name, v) && 'font-mono',
                              v === null && 'text-ink-2',
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

      {data.pages > 1 && (
        <div className="flex justify-end">
          <DbPagination page={data.page} pages={data.pages} onPage={(page) => go({ page: page > 1 ? page : undefined })} />
        </div>
      )}

      <DbDrawer table={data.table} columns={data.columns} row={drawerRow} missing={missing} rowKey={open} onClose={close} />
    </section>
  )
}
