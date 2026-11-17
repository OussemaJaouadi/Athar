import { DeskSelect } from '@/components/athar/desk'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { useTable, type ColumnDef, type RowSelectionState, type SortingState } from '@tanstack/react-table'
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Search } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { RecordPane, asJson, humanize, idText, isUrl, tableName, type DbColumn } from '@/components/athar/db-panel'
import { DeskBar, EmptyValue, deskBtn, deskInput, useDeskKeys } from '@/components/athar/desk'
import { DataGrid, DataGridContainer, dataGridFeatures, type DataGridFeatures } from '@/components/reui/data-grid/data-grid'
import { DataGridScrollArea } from '@/components/reui/data-grid/data-grid-scroll-area'
import { DataGridTable } from '@/components/reui/data-grid/data-grid-table'
import { cn } from '@/lib/utils'
import { getDbRows, listDbTables, type DbRow } from '#/server/api/database'
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
  // The selected row is not a loader dependency: selecting never refetches the grid.
  loaderDeps: ({ search: { table, q, sort, dir, page } }) => ({ table, q, sort, dir, page }),
  loader: async ({ deps }) => {
    // Tables from before pipeline v2 open their successor; no table opens Entries.
    const table = deps.table ? (LEGACY[deps.table] ?? deps.table) : 'entries'
    const [groups, data] = await Promise.all([listDbTables(), getDbRows({ data: { ...deps, table } })])
    return { groups, table, data }
  },
  component: DatabasePage,
})

const LEGACY: Record<string, string> = { source_rows: 'entries', source_snapshots: 'downloads', records: 'startups', review_items: 'startups' }

const n = (v: number) => v.toLocaleString('en-GB')
type Data = NonNullable<Awaited<ReturnType<typeof getDbRows>>>
type Groups = Awaited<ReturnType<typeof listDbTables>>

// Database: three panes. Tables by stage | the grid | the selected row read as a record.
function DatabasePage() {
  const { groups, table, data } = Route.useLoaderData()
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const go = useCallback(
    (next: Partial<Search>, replace = false) => navigate({ search: (prev: Search) => ({ ...prev, ...next }), replace }),
    [navigate],
  )
  const searchRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState(data?.q ?? '')
  useEffect(() => setQuery(data?.q ?? ''), [table, data?.q])
  // Search as you type, a beat after the last key.
  useEffect(() => {
    if (!data || query.trim() === data.q) return
    const t = setTimeout(() => go({ q: query.trim() || undefined, page: undefined, row: undefined }, true), 300)
    return () => clearTimeout(t)
  }, [query, data, go])

  // Below 1100px the record is its own view, opened by choosing a row.
  const [narrowRecord, setNarrowRecord] = useState(false)

  const first = data && data.total ? (data.page - 1) * PAGE_SIZE + 1 : 0
  const last = data ? (data.page - 1) * PAGE_SIZE + data.rows.length : 0
  const name = tableName(table)

  return (
    <main className="flex min-h-0 flex-1 flex-col">
      <DeskBar
        title="Database"
        facts={data ? (data.total ? `${n(first)}–${n(last)} of ${n(data.total)}${data.q ? ` matching “${data.q}”` : ''}` : data.q ? 'No matches' : 'Empty') : undefined}
        actions={
          data && (
            <span className="flex gap-1.5">
              <button
                type="button"
                className={cn(deskBtn, 'w-8 justify-center px-0')}
                aria-label="Previous page"
                disabled={data.page <= 1}
                onClick={() => go({ page: data.page - 1 > 1 ? data.page - 1 : undefined, row: undefined })}
              >
                <ChevronLeft aria-hidden />
              </button>
              <button
                type="button"
                className={cn(deskBtn, 'w-8 justify-center px-0')}
                aria-label="Next page"
                disabled={data.page >= data.pages}
                onClick={() => go({ page: data.page + 1, row: undefined })}
              >
                <ChevronRight aria-hidden />
              </button>
            </span>
          )
        }
      >
        <label className="sr-only min-[1100px]:hidden" htmlFor="db-table">
          Table
        </label>
        <div className="min-w-56 min-[1100px]:hidden">
          <DeskSelect
            id="db-table"
            value={table}
            onChange={(v) => navigate({ search: { table: v } })}
            options={groups.flatMap((g) => g.tables.map((t) => ({ value: t.name, label: tableName(t.name), hint: `${g.stage} · ${n(t.rows)} rows` })))}
          />
        </div>
        {data && (
          <label className="relative flex items-center">
            <span className="sr-only">Search {name}</span>
            <Search className="pointer-events-none absolute start-2.5 size-4 text-ink-2" aria-hidden />
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${name.toLowerCase()}`}
              className={cn(deskInput, 'w-64 max-w-full ps-8')}
            />
            <kbd className="pointer-events-none absolute end-2 hidden rounded-[4px] border border-edge px-1 font-mono text-[0.8125rem] text-ink-2 min-[1100px]:block" aria-hidden>
              /
            </kbd>
          </label>
        )}
      </DeskBar>
      <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[minmax(0,1fr)] min-[1100px]:grid-cols-[210px_minmax(0,1fr)_minmax(380px,500px)]">
        <TableList groups={groups} current={table} />
        {data ? (
          <Workspace
            key={table}
            data={data}
            selected={search.row}
            go={go}
            searchRef={searchRef}
            narrowRecord={narrowRecord}
            setNarrowRecord={setNarrowRecord}
          />
        ) : (
          <Unknown table={table} />
        )}
      </div>
    </main>
  )
}

function TableList({ groups, current }: { groups: Groups; current: string }) {
  return (
    <nav aria-label="Tables" className="hidden min-h-0 overflow-y-auto border-e border-edge py-2.5 min-[1100px]:block">
      {groups.map((g) => (
        <section key={g.stage} aria-labelledby={`stage-${g.stage}`}>
          <h2 id={`stage-${g.stage}`} className="mx-4 mt-2.5 mb-1 font-sans text-[0.8125rem] font-normal text-ink-2">
            {g.stage}
          </h2>
          <ul>
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
                      'flex items-center justify-between gap-3 px-4 py-[5px] text-[0.875rem] text-ink no-underline',
                      active ? 'bg-surface shadow-[inset_3px_0_0_var(--ink)]' : 'hover:bg-surface',
                    )}
                  >
                    <span className="truncate">{tableName(t.name)}</span>
                    <span className="text-[0.8125rem] text-ink-2 tabular-nums">{n(t.rows)}</span>
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
    <section className="grid content-start gap-1 p-6 text-[0.875rem] text-ink min-[1100px]:col-span-2">
      <p>
        There is no table named <span className="font-mono">{table}</span>.
      </p>
      <p>
        Pick one from the list, or{' '}
        <Link to="/portal/database" search={{ table: 'entries' }} className="text-glaze underline">
          open Entries
        </Link>
        .
      </p>
    </section>
  )
}

/** One grid cell: short and single-line; the record pane shows the value in full. */
function Cell({ col, v }: { col: DbColumn; v: DbRow[string] }) {
  if (v === null || v === undefined || v === '') return <EmptyValue />
  if (col.secret) return <span>••••</span>
  if (col.blob) return <span className="tabular-nums">{`${(Number(v) / 1024).toFixed(0)} KB`}</span>
  if (typeof v === 'number') return <span className="tabular-nums">{v}</span>
  const id = idText(col.name, v)
  if (id)
    return (
      <span className={cn(id.mono && 'font-mono text-[0.8125rem]')} title={id.full}>
        {id.text}
      </span>
    )
  const json = asJson(v)
  const text = json !== undefined ? JSON.stringify(json) : v
  return <span className={cn((json !== undefined || isUrl(v)) && 'font-mono text-[0.8125rem]')}>{text.length > 120 ? `${text.slice(0, 120)}…` : text}</span>
}

function Workspace({
  data,
  selected,
  go,
  searchRef,
  narrowRecord,
  setNarrowRecord,
}: {
  data: Data
  selected: string | undefined
  go: (next: Partial<Search>, replace?: boolean) => void
  searchRef: React.RefObject<HTMLInputElement | null>
  narrowRecord: boolean
  setNarrowRecord: (v: boolean) => void
}) {
  const keyOf = useCallback((r: DbRow) => String(r[data.key] ?? r.__rowid), [data.key])
  const ids = useMemo(() => data.rows.map(keyOf), [data.rows, keyOf])
  // The first row is selected on load; a linked row may sit on another page: the record pane fetches it by key.
  const current = selected ?? ids[0]

  const select = useCallback(
    (id: string) => {
      go({ row: id }, true)
      setNarrowRecord(true)
    },
    [go, setNarrowRecord],
  )
  useDeskKeys({ ids, current, select: (id) => go({ row: id }, true), search: searchRef })

  const columns = useMemo<ColumnDef<DataGridFeatures, DbRow>[]>(
    () =>
      data.columns.map((c) => ({
        id: c.name,
        accessorFn: (r: DbRow) => r[c.name] ?? null,
        enableSorting: !c.blob && !c.secret && !c.virtual,
        header: () => {
          if (c.virtual) return <span className="text-[0.8125rem] font-normal whitespace-nowrap text-ink-2">{humanize(c.name)}</span>
          const sorted = data.sort === c.name ? data.dir : null
          return (
            <button
              type="button"
              title={c.name}
              onClick={() => {
                const next = data.sort !== c.name ? 'asc' : data.dir === 'asc' ? 'desc' : null
                go({ sort: next ? c.name : undefined, dir: next ?? undefined, page: undefined, row: undefined })
              }}
              aria-label={`Sort by ${humanize(c.name)}`}
              className={cn('inline-flex items-center gap-1 text-[0.8125rem] font-normal whitespace-nowrap hover:text-ink', sorted ? 'text-ink' : 'text-ink-2')}
            >
              {humanize(c.name)}
              {sorted === 'asc' && <ArrowUp className="size-3.5" aria-hidden />}
              {sorted === 'desc' && <ArrowDown className="size-3.5" aria-hidden />}
            </button>
          )
        },
        cell: ({ row }) => <Cell col={c} v={row.original[c.name] ?? null} />,
        meta: { headerTitle: humanize(c.name) },
      })),
    [data.columns, data.sort, data.dir, go],
  )
  const sorting = useMemo<SortingState>(() => (data.sort ? [{ id: data.sort, desc: data.dir === 'desc' }] : []), [data.sort, data.dir])
  const rowSelection = useMemo<RowSelectionState>(() => (current ? { [current]: true } : {}), [current])
  const table = useTable({
    features: dataGridFeatures,
    data: data.rows,
    columns,
    getRowId: keyOf,
    state: { sorting, rowSelection },
    manualSorting: true,
    manualPagination: true,
    manualFiltering: true,
    enableRowSelection: true,
    rowCount: data.total,
  })

  const name = tableName(data.table)
  return (
    <>
      <section aria-label={`${name} rows`} className={cn('min-h-0 min-w-0', narrowRecord && 'max-[1099px]:hidden')}>
        {data.rows.length === 0 ? (
          <p className="p-6 text-[0.875rem] text-ink">
            {data.q ? (
              <>
                Nothing in {name} matches “{data.q}”.{' '}
                <button type="button" className="text-glaze underline" onClick={() => go({ q: undefined, page: undefined })}>
                  Clear the search
                </button>
              </>
            ) : (
              'This table is empty.'
            )}
          </p>
        ) : (
          <DataGrid
            table={table}
            recordCount={data.total}
            onRowClick={(r) => select(keyOf(r))}
            tableLayout={{ headerSticky: true, width: 'auto', rowBorder: true, headerBorder: true }}
            tableClassNames={{
              base: 'text-[0.875rem]',
              header: 'bg-canvas',
              headerRow: '[&>th]:h-[34px] [&>th]:border-b [&>th]:border-edge [&>th]:px-3 [&>th]:bg-canvas',
              bodyRow: cn(
                'hover:bg-surface data-[state=selected]:bg-surface data-[state=selected]:[&>td:first-child]:shadow-[inset_3px_0_0_var(--ink)]',
                '[&>td]:h-9 [&>td]:max-w-[340px] [&>td]:truncate [&>td]:border-hairline [&>td]:px-3 [&>td]:py-0 [&>td]:text-ink',
              ),
            }}
          >
            <DataGridContainer className="h-full">
              <DataGridScrollArea className="h-full">
                <DataGridTable />
              </DataGridScrollArea>
            </DataGridContainer>
          </DataGrid>
        )}
      </section>
      <aside
        aria-label="Selected row"
        className={cn(
          'grid min-h-0 min-w-0 content-start gap-[18px] overflow-y-auto overscroll-contain border-edge px-5 py-4 min-[1100px]:border-s',
          !narrowRecord && 'max-[1099px]:hidden',
        )}
      >
        <button type="button" onClick={() => setNarrowRecord(false)} className="flex items-center gap-1 text-[0.875rem] text-glaze min-[1100px]:hidden">
          <ChevronLeft className="size-4" aria-hidden />
          Back to {name.toLowerCase()}
        </button>
        <RecordPane table={data.table} rowKey={current} />
      </aside>
    </>
  )
}
