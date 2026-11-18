import { Link } from '@tanstack/react-router'
import { useTable, type ColumnDef, type SortingState } from '@tanstack/react-table'
import { ArrowDown, ArrowUp, Check, ChevronLeft, Copy } from 'lucide-react'
import { useMemo, useState } from 'react'

import { deskBtn } from '@/components/athar/desk'
import { DataGrid, DataGridContainer, dataGridFeatures, type DataGridFeatures } from '@/components/reui/data-grid/data-grid'
import { DataGridScrollArea } from '@/components/reui/data-grid/data-grid-scroll-area'
import { DataGridTable } from '@/components/reui/data-grid/data-grid-table'
import { StartupLink } from '@/components/athar/startup-glimpse'
import { cn } from '@/lib/utils'
import type { FactRow } from '#/server/pipeline/facts'

// The counted facts that have rows behind them (getFactRows returns rows for these; null for every other code).
const ROW_CODES = new Set([
  'no_description',
  'listed_more_than_once',
  'other_sector',
  'other_name',
  'website_text_removed',
  'second_website',
  'website_unreadable',
  'label_unreadable',
  'label_before_creation',
  'not_in_registry',
  'reachable',
  'unreachable',
  'moved',
  'social_not_checked',
  'no_website',
  'from_prepared',
  'exact_copies',
])

/** Whether a counted fact can be opened as the list of startups or entries it counts. */
export const hasRows = (code: string) => ROW_CODES.has(code) || code.startsWith('unreachable:')

const dateOnly = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

const csvCell = (v: string | null) => (v === null ? '' : /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)

/**
 * The rows behind one counted fact, in place of the step pane's body: startup (with its hover preview) and the value
 * the fact is about. The list is read from the data as it is today, which can differ from what the run counted.
 */
export function FactList({
  label,
  counted,
  countedOn,
  result,
  onBack,
}: {
  label: string
  counted: number
  countedOn: string | null
  result: { rows: FactRow[]; total: number } | null
  onBack: () => void
}) {
  const [copied, setCopied] = useState(false)
  const back = (
    <button type="button" onClick={onBack} className="inline-flex items-center gap-1 text-[0.875rem] text-glaze underline">
      <ChevronLeft className="size-4" aria-hidden />
      Back to the step
    </button>
  )
  if (!result)
    return (
      <div className="grid gap-3">
        {back}
        <p className="text-[0.875rem] text-ink">This count has no list of rows behind it.</p>
      </div>
    )
  const { rows, total } = result
  return (
    <div className="grid gap-3">
      {back}
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h3 className="font-sans text-[0.9375rem] font-medium text-ink">
          <span className="tabular-nums">{total.toLocaleString('en-GB')}</span> {label}
        </h3>
        <button
          type="button"
          className={deskBtn}
          onClick={() => {
            const csv = ['startup,startup_id,value', ...rows.map((r) => [r.name, r.startupId, r.value].map(csvCell).join(','))].join('\n')
            navigator.clipboard
              ?.writeText(csv)
              .then(() => {
                setCopied(true)
                setTimeout(() => setCopied(false), 1500)
              })
              .catch(() => setCopied(false))
          }}
        >
          {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
          {copied ? 'Copied' : 'Copy as CSV'}
        </button>
      </div>
      <p className="text-[0.8125rem] text-ink-2">
        This list reads the data as it is today
        {countedOn ? `; the run counted ${counted.toLocaleString('en-GB')} on ${dateOnly(countedOn)}` : ''}.
        {rows.length < total && ` Showing ${rows.length.toLocaleString('en-GB')} of ${total.toLocaleString('en-GB')}.`}
      </p>
      {rows.length === 0 ? (
        <p className="text-[0.875rem] text-ink">Nothing in the data matches this any more.</p>
      ) : (
        <FactGrid rows={rows} />
      )}
    </div>
  )
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const monthYear = (labelled: string) => `${MONTHS[Number(labelled.slice(5, 7)) - 1] ?? ''} ${labelled.slice(0, 4)}`.trim()

type SortKey = 'name' | 'value' | 'labelled' | 'observedOn'
const COLUMNS: [SortKey, string][] = [
  ['name', 'Startup'],
  ['value', 'What'],
  ['labelled', 'Labelled'],
  ['observedOn', 'Observed on'],
]

/** The rows behind a fact in ReUI's Data Grid: a sticky header, sortable columns, dense rows. */
function FactGrid({ rows }: { rows: FactRow[] }) {
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: 'name', desc: false })
  const sorted = useMemo(() => {
    const of = (r: FactRow) => (r[sort.key] as string | null | undefined) ?? ''
    return [...rows].sort((a, b) => (sort.desc ? -1 : 1) * of(a).localeCompare(of(b)))
  }, [rows, sort])
  const columns = useMemo<ColumnDef<DataGridFeatures, FactRow>[]>(
    () =>
      COLUMNS.map(([key, label]) => ({
        id: key,
        accessorFn: (r: FactRow) => r[key] ?? null,
        header: () => (
          <button
            type="button"
            aria-label={`Sort by ${label}`}
            onClick={() => setSort((p) => ({ key, desc: p.key === key ? !p.desc : false }))}
            className={cn('inline-flex items-center gap-1 text-[0.8125rem] font-normal whitespace-nowrap hover:text-ink', sort.key === key ? 'text-ink' : 'text-ink-2')}
          >
            {label}
            {sort.key === key && (sort.desc ? <ArrowDown className="size-3.5" aria-hidden /> : <ArrowUp className="size-3.5" aria-hidden />)}
          </button>
        ),
        cell: ({ row }) => {
          const r = row.original
          if (key === 'name')
            return (
              <span className="flex items-baseline gap-2">
                {r.startupId ? (
                  <StartupLink id={r.startupId} className="truncate text-glaze underline">
                    <span dir="auto">{r.name}</span>
                  </StartupLink>
                ) : (
                  <span dir="auto" className="truncate">
                    {r.name}
                  </span>
                )}
                {r.entryId && (
                  <Link to="/portal/startups" search={{ entry: r.entryId }} className="font-mono text-[0.8125rem] text-glaze underline">
                    {r.entryId.slice(0, 8)}
                  </Link>
                )}
              </span>
            )
          const v = key === 'labelled' ? (r.labelled ? monthYear(r.labelled) : null) : key === 'observedOn' ? (r.observedOn ? dateOnly(r.observedOn) : null) : r.value
          return v ? <span className={key === 'value' ? undefined : 'tabular-nums'}>{v}</span> : <span className="text-ink-3">—</span>
        },
        meta: { headerTitle: label },
      })),
    [sort],
  )
  const sorting = useMemo<SortingState>(() => [{ id: sort.key, desc: sort.desc }], [sort])
  const table = useTable({
    features: dataGridFeatures,
    data: sorted,
    columns,
    getRowId: (r, i) => `${r.entryId ?? r.startupId ?? r.name}-${i}`,
    state: { sorting },
    manualSorting: true,
    manualPagination: true,
    manualFiltering: true,
    rowCount: sorted.length,
  })
  return (
    <div className="h-[min(62vh,640px)] min-h-0 border border-edge">
      <DataGrid
        table={table}
        recordCount={sorted.length}
        tableLayout={{ headerSticky: true, width: 'auto', rowBorder: true, headerBorder: true }}
        tableClassNames={{
          base: 'text-[0.875rem]',
          header: 'bg-canvas',
          headerRow: '[&>th]:h-[34px] [&>th]:border-b [&>th]:border-edge [&>th]:px-3 [&>th]:bg-canvas',
          bodyRow: 'hover:bg-surface [&>td]:h-9 [&>td]:max-w-[420px] [&>td]:truncate [&>td]:border-hairline [&>td]:px-3 [&>td]:py-0 [&>td]:text-ink',
        }}
      >
        <DataGridContainer className="h-full">
          <DataGridScrollArea className="h-full">
            <DataGridTable />
          </DataGridScrollArea>
        </DataGridContainer>
      </DataGrid>
    </div>
  )
}
