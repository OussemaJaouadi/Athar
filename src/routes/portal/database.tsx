import { DeskSelect } from '@/components/athar/desk'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { useTable, type ColumnDef, type RowSelectionState, type SortingState } from '@tanstack/react-table'
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Search } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { IdeaCheckRecord, PersonRecord, RecordPane, asJson, humanize, idText, isUrl, tableName, type DbColumn } from '@/components/athar/db-panel'
import { DeskBar, EmptyValue, deskBtn, deskInput, useDeskKeys } from '@/components/athar/desk'
import { DataGrid, DataGridContainer, dataGridFeatures, type DataGridFeatures } from '@/components/reui/data-grid/data-grid'
import { DataGridScrollArea } from '@/components/reui/data-grid/data-grid-scroll-area'
import { DataGridTable } from '@/components/reui/data-grid/data-grid-table'
import { cn } from '@/lib/utils'
import { getDbRows, listDbTables, type DbRow } from '#/server/api/database'
import { listIdeaChecks, listPeople } from '#/server/api/ops'
import type { IdeaCheckRow, PersonRow } from '#/server/pipeline/facts'
import { DB_PAGE_SIZE as PAGE_SIZE } from '#/shared/database'

type Search = { table?: string; q?: string; sort?: string; dir?: 'asc' | 'desc'; page?: number; row?: string; repeat?: boolean }

export const Route = createFileRoute('/portal/database')({
  validateSearch: (s: Record<string, unknown>): Search => ({
    table: typeof s.table === 'string' ? s.table : undefined,
    q: typeof s.q === 'string' && s.q ? s.q : undefined,
    sort: typeof s.sort === 'string' ? s.sort : undefined,
    dir: s.dir === 'desc' ? 'desc' : s.dir === 'asc' ? 'asc' : undefined,
    page: typeof s.page === 'number' && s.page > 1 ? Math.floor(s.page) : undefined,
    row: typeof s.row === 'string' || typeof s.row === 'number' ? String(s.row) : undefined,
    repeat: s.repeat === true || s.repeat === 'true' ? true : undefined,
  }),
  // The selected row is not a loader dependency: selecting never refetches the grid.
  loaderDeps: ({ search: { table, q, sort, dir, page, repeat } }) => ({ table, q, sort, dir, page, repeat }),
  loader: async ({ deps }) => {
    // Tables from before pipeline v2 open their successor; no table opens Entries.
    const table = deps.table ? (LEGACY[deps.table] ?? deps.table) : 'entries'
    const [tables, everyone] = await Promise.all([listDbTables(), listPeople({ data: { limit: 1 } })])
    // People is founders grouped by person, not a table: it sits under Derived, after Startups.
    const groups = tables.map((g) =>
      g.stage === 'Derived' ? { ...g, tables: [g.tables[0], { name: 'people', rows: everyone.total }, ...g.tables.slice(1)].filter(Boolean) } : g,
    )
    if (table === 'people') {
      const page = deps.page ?? 1
      const people = await listPeople({ data: { q: deps.q, repeat: deps.repeat, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE } })
      return { groups, table, data: null, people: { ...people, page, pages: Math.max(1, Math.ceil(people.total / PAGE_SIZE)), q: deps.q ?? '' }, ideas: null }
    }
    const [data, ideas] = await Promise.all([
      getDbRows({ data: { ...deps, table } }),
      table === 'idea_checks' ? listIdeaChecks({ data: { limit: 500 } }) : Promise.resolve(null),
    ])
    return { groups, table, data, people: null, ideas }
  },
  component: DatabasePage,
})

const LEGACY: Record<string, string> = { source_rows: 'entries', source_snapshots: 'downloads', records: 'startups', review_items: 'startups' }

const n = (v: number) => v.toLocaleString('en-GB')
type Data = NonNullable<Awaited<ReturnType<typeof getDbRows>>>
type People = { rows: PersonRow[]; total: number; page: number; pages: number; q: string }
type Groups = Awaited<ReturnType<typeof listDbTables>>

// Database: three panes. Tables by stage | the grid | the selected row read as a record.
function DatabasePage() {
  const { groups, table, data, people, ideas } = Route.useLoaderData()
  // The pager and search work the same over a table or over People.
  const list = data ? { page: data.page, pages: data.pages, total: data.total, q: data.q, shown: data.rows.length } : people ? { page: people.page, pages: people.pages, total: people.total, q: people.q, shown: people.rows.length } : null
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const go = useCallback(
    (next: Partial<Search>, replace = false) => navigate({ search: (prev: Search) => ({ ...prev, ...next }), replace }),
    [navigate],
  )
  const searchRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState(list?.q ?? '')
  useEffect(() => setQuery(list?.q ?? ''), [table, list?.q])
  // Search as you type, a beat after the last key.
  useEffect(() => {
    if (!list || query.trim() === list.q) return
    const t = setTimeout(() => go({ q: query.trim() || undefined, page: undefined, row: undefined }, true), 300)
    return () => clearTimeout(t)
  }, [query, list, go])

  // Below 1100px the record is its own view, opened by choosing a row.
  const [narrowRecord, setNarrowRecord] = useState(false)

  const first = list && list.total ? (list.page - 1) * PAGE_SIZE + 1 : 0
  const last = list ? (list.page - 1) * PAGE_SIZE + list.shown : 0
  const name = tableName(table)

  return (
    <main className="flex min-h-0 flex-1 flex-col">
      <DeskBar
        title="Database"
        facts={list ? (list.total ? `${n(first)}–${n(last)} of ${n(list.total)}${list.q ? ` matching “${list.q}”` : ''}` : list.q ? 'No matches' : 'Empty') : undefined}
        actions={
          list && (
            <span className="flex gap-1.5">
              <button
                type="button"
                className={cn(deskBtn, 'w-8 justify-center px-0')}
                aria-label="Previous page"
                disabled={list.page <= 1}
                onClick={() => go({ page: list.page - 1 > 1 ? list.page - 1 : undefined, row: undefined })}
              >
                <ChevronLeft aria-hidden />
              </button>
              <button
                type="button"
                className={cn(deskBtn, 'w-8 justify-center px-0')}
                aria-label="Next page"
                disabled={list.page >= list.pages}
                onClick={() => go({ page: list.page + 1, row: undefined })}
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
        {list && (
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
        {people && (
          <button
            type="button"
            aria-pressed={!!search.repeat}
            onClick={() => go({ repeat: search.repeat ? undefined : true, page: undefined, row: undefined })}
            className={cn(
              'inline-flex h-7 items-center rounded-[5px] border border-edge px-2.5 text-[0.8125rem] text-ink',
              search.repeat ? 'bg-surface-raised shadow-[inset_0_-2px_0_var(--ink)]' : 'hover:bg-surface',
            )}
          >
            On more than one startup
          </button>
        )}
      </DeskBar>
      <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[minmax(0,1fr)] min-[1100px]:grid-cols-[210px_minmax(0,1fr)_minmax(380px,500px)]">
        <TableList groups={groups} current={table} />
        {people ? (
          <PeopleWorkspace key="people" people={people} selected={search.row} go={go} searchRef={searchRef} narrowRecord={narrowRecord} setNarrowRecord={setNarrowRecord} />
        ) : data ? (
          <Workspace
            key={table}
            data={data}
            ideas={ideas}
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

// A link inside a row must not also select the row.
const stop = (e: React.MouseEvent) => e.stopPropagation()

/** A cell that points at another thing shows that thing, as a link: the startup, the entry, the download, the run. */
function foreignKey(name: string, v: DbRow[string]): React.ReactNode | null {
  if (v === null || v === undefined || v === '') return null
  if (name === 'startup_id' && typeof v === 'string')
    return (
      <Link to="/startups/$id" params={{ id: v }} onClick={stop} className="text-glaze underline">
        {v}
      </Link>
    )
  if (name === 'entry_id' && typeof v === 'string')
    return (
      <Link to="/portal/entries" search={{ entry: v }} onClick={stop} className="font-mono text-[0.8125rem] text-glaze underline">
        {v}
      </Link>
    )
  if ((name === 'first_download' || name === 'last_download') && typeof v === 'number')
    return (
      <Link to="/portal/database" search={{ table: 'downloads', row: String(v) }} onClick={stop} className="text-glaze underline tabular-nums">
        download {v}
      </Link>
    )
  if (name === 'run_id' && typeof v === 'string')
    return (
      <Link to="/portal" search={{ run: v }} onClick={stop} className="font-mono text-[0.8125rem] text-glaze underline">
        …{v.slice(-4)}
      </Link>
    )
  return null
}

/** One grid cell: short and single-line; the record pane shows the value in full. */
function Cell({ col, v }: { col: DbColumn; v: DbRow[string] }) {
  if (v === null || v === undefined || v === '') return <EmptyValue />
  if (col.secret) return <span>••••</span>
  if (col.blob) return <span className="tabular-nums">{`${(Number(v) / 1024).toFixed(0)} KB`}</span>
  const fk = foreignKey(col.name, v)
  if (fk) return fk
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
  ideas,
  selected,
  go,
  searchRef,
  narrowRecord,
  setNarrowRecord,
}: {
  data: Data
  ideas: IdeaCheckRow[] | null
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
        {ideas ? <IdeaCheckRecord check={ideas.find((c) => c.id === current)} /> : <RecordPane table={data.table} rowKey={current} />}
      </aside>
    </>
  )
}

/** People: founders grouped by person, searchable by any spelling; the pane shows a person's startups. */
function PeopleWorkspace({
  people,
  selected,
  go,
  searchRef,
  narrowRecord,
  setNarrowRecord,
}: {
  people: People
  selected: string | undefined
  go: (next: Partial<Search>, replace?: boolean) => void
  searchRef: React.RefObject<HTMLInputElement | null>
  narrowRecord: boolean
  setNarrowRecord: (v: boolean) => void
}) {
  const ids = useMemo(() => people.rows.map((p) => p.slug), [people.rows])
  const current = selected && ids.includes(selected) ? selected : ids[0]
  useDeskKeys({ ids, current, select: (id) => go({ row: id }, true), search: searchRef })
  const th = 'h-[34px] border-b border-edge px-3 text-start text-[0.8125rem] font-normal whitespace-nowrap text-ink-2'
  const td = 'h-9 border-b border-hairline px-3 text-[0.875rem] text-ink'
  return (
    <>
      <section aria-label="People" className={cn('min-h-0 min-w-0 overflow-y-auto', narrowRecord && 'max-[1099px]:hidden')}>
        {people.rows.length === 0 ? (
          <p className="p-6 text-[0.875rem] text-ink">{people.q ? `No one matches “${people.q}”.` : 'No people.'}</p>
        ) : (
          <table className="w-full">
            <thead className="sticky top-0 bg-canvas">
              <tr>
                <th className={th}>Name</th>
                <th className={th}>Startups</th>
                <th className={th}>Other spellings</th>
              </tr>
            </thead>
            <tbody>
              {people.rows.map((p) => {
                const on = p.slug === current
                return (
                  <tr
                    key={p.slug}
                    aria-selected={on}
                    onClick={() => (go({ row: p.slug }, true), setNarrowRecord(true))}
                    className={cn('cursor-pointer hover:bg-surface', on && 'bg-surface [&>td:first-child]:shadow-[inset_3px_0_0_var(--ink)]')}
                  >
                    <td className={td}>{p.name}</td>
                    <td className={cn(td, 'tabular-nums')}>{p.startups.length}</td>
                    <td className={cn(td, 'max-w-[340px] truncate')}>{p.spellings.length ? p.spellings.join(', ') : <EmptyValue />}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </section>
      <aside
        aria-label="Selected person"
        className={cn(
          'grid min-h-0 min-w-0 content-start gap-[18px] overflow-y-auto overscroll-contain border-edge px-5 py-4 min-[1100px]:border-s',
          !narrowRecord && 'max-[1099px]:hidden',
        )}
      >
        <button type="button" onClick={() => setNarrowRecord(false)} className="flex items-center gap-1 text-[0.875rem] text-glaze min-[1100px]:hidden">
          <ChevronLeft className="size-4" aria-hidden />
          Back to people
        </button>
        <PersonRecord person={people.rows.find((p) => p.slug === current)} />
      </aside>
    </>
  )
}
