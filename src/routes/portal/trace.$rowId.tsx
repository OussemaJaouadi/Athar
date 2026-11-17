import { Link, createFileRoute, notFound, useRouter } from '@tanstack/react-router'
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  ChevronDown,
  ChevronRight,
  CircleCheck,
  Database,
  Download,
  Eraser,
  ExternalLink,
  ListChecks,
  Merge,
  RotateCcw,
  type LucideIcon,
} from 'lucide-react'
import { useState } from 'react'

import { findingName, labTime } from '@/components/athar/lab'
import { RowJump, TraceCopy, Value, fieldLabel, valueText } from '@/components/athar/trace-parts'
import { cn } from '@/lib/utils'
import { setReviewStatus } from '#/server/api/portal'
import { getTraceRow, type TraceValues } from '#/server/api/trace'

export const Route = createFileRoute('/portal/trace/$rowId')({
  loader: async ({ params }) => {
    const data = await getTraceRow({ data: params.rowId })
    if (!data) throw notFound()
    return data
  },
  component: TracePage,
})

type Data = NonNullable<Awaited<ReturnType<typeof getTraceRow>>>

const FIELDS: (keyof TraceValues)[] = ['name', 'description', 'sector', 'website', 'founders', 'cohort', 'creation_year']
// Changes every row gets: said once, not listed as if they were about this startup.
const ROUTINE = new Set(['logo', 'industry'])

const plural = (k: number, one: string, many = `${one}s`) => `${k.toLocaleString('en-GB')} ${k === 1 ? one : many}`
const took = (s?: { started_at: string | null; finished_at: string | null }) => {
  if (!s?.started_at || !s.finished_at) return null
  const ms = Date.parse(s.finished_at) - Date.parse(s.started_at)
  return `${Math.max(0.1, ms / 1000).toFixed(1)} s`
}

function TracePage() {
  const data = Route.useLoaderData()
  const { row, record, changes, startup, merged, findings, prev, next, lastRow } = data
  const name = record?.name || data.rawFields.find(([k]) => k === 'name')?.[1] || 'Unnamed row'
  const open = findings.filter((f) => f.status === 'open')
  const own = changes.filter((c) => !ROUTINE.has(c.field))
  const others = merged.length - 1

  return (
    <main className="grid content-start gap-8 p-4 lg:p-8">
      <nav aria-label="Breadcrumb">
        <ol className="flex items-center gap-1.5 text-[0.875rem]">
          <li>
            <Link to="/portal/trace" className="text-glaze underline">
              Trace
            </Link>
          </li>
          <li aria-hidden className="text-ink-2">
            <ChevronRight className="size-4" />
          </li>
          <li aria-current="page" className="text-ink">
            Row {row.row_number}
          </li>
        </ol>
      </nav>

      <header className="flex flex-wrap items-end justify-between gap-x-10 gap-y-5">
        <div className="grid max-w-[64rem] gap-3">
          <h1 className="font-display text-[1.75rem] leading-9">
            Row {row.row_number} · {name}
          </h1>
          <p className="font-display text-[1.375rem] leading-9 text-ink">
            Downloaded {labTime(row.fetched_at)} as row {row.row_number} of {lastRow}.{' '}
            {record ? (own.length ? `Cleaning changed ${plural(own.length, 'field')}. ` : 'Cleaning changed nothing that matters. ') : 'Not cleaned yet. '}
            {startup
              ? others > 0
                ? `Merged with ${plural(others, 'other row')} into ${startup.values.name}.`
                : `It is the only registration of ${startup.values.name}.`
              : 'Not matched to a startup.'}{' '}
            {open.length ? `${plural(open.length, 'finding')} open.` : ''}
          </p>
        </div>
        <div className="grid justify-items-end gap-3">
          <div className="flex items-center gap-2">
            <Pager to={prev} dir="prev" />
            <Pager to={next} dir="next" />
          </div>
          <RowJump last={lastRow} />
        </div>
      </header>

      {findings.length > 0 && <Findings findings={findings} />}

      <ol className="grid gap-3" aria-label="This row through the pipeline">
        <Station n={1} Icon={Download} title="Collect" runId={row.run_id} time={took(data.steps.find((s) => s.step === 'collect'))} summary="The row exactly as the registry gave it.">
          <RawRow data={data} />
        </Station>

        <Station n={2} Icon={Eraser} title="Clean" runId={row.run_id} time={took(data.steps.find((s) => s.step === 'clean'))} summary={record ? (own.length ? `${plural(own.length, 'field')} changed; the original stays in the raw row.` : 'No field of this row needed a change.') : 'This row has not been cleaned.'}>
          {own.length > 0 && (
            <div className="overflow-x-auto rounded-md border border-edge">
              <table className="w-full text-[0.875rem]">
                <thead className="bg-canvas text-[0.8125rem] text-ink-2">
                  <tr>
                    {['Field', 'Before', 'After', 'Why'].map((h) => (
                      <th key={h} scope="col" className="px-4 py-2.5 text-start font-medium">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {own.map((c, i) => (
                    <tr key={c.field + i} className="border-t border-hairline align-top">
                      <th scope="row" className="px-4 py-3 text-start font-medium text-ink whitespace-nowrap">
                        {fieldLabel(c.field)}
                      </th>
                      <td className="max-w-[28rem] px-4 py-3 font-mono text-[0.8125rem] break-words">
                        <Value v={c.from} />
                      </td>
                      <td className="max-w-[28rem] px-4 py-3 font-mono text-[0.8125rem] break-words">
                        <Value v={c.to} />
                      </td>
                      <td className="px-4 py-3 text-ink">{c.why}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {changes.some((c) => ROUTINE.has(c.field)) && (
            <p className="text-ink">Like every row, its placeholder logo was dropped and its industry, a copy of the sector, was folded into sector.</p>
          )}
        </Station>

        <Station
          n={3}
          Icon={Merge}
          title="Merge"
          runId={row.run_id}
          time={took(data.steps.find((s) => s.step === 'merge'))}
          summary={startup ? (others > 0 ? `${plural(merged.length, 'registration')} of the same startup, matched and folded into one.` : 'No other row describes this startup, so nothing was merged.') : 'This row was not matched to a startup.'}
        >
          {startup && others > 0 && <MergeTable data={data} />}
        </Station>

        <Station n={4} Icon={Building2} title="Startup" summary={startup ? 'What the reading room shows for this startup.' : 'No startup yet.'} last>
          {startup && (
            <div className="grid gap-4">
              <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-[10rem_minmax(0,1fr)]">
                {FIELDS.map((f) => (
                  <div key={f} className="contents">
                    <dt className="text-[0.8125rem] text-ink-2">{fieldLabel(f)}</dt>
                    <dd className="text-[0.9375rem] leading-6">
                      <Value v={startup.values[f]} />
                    </dd>
                  </div>
                ))}
                {startup.website_status && (
                  <div className="contents">
                    <dt className="text-[0.8125rem] text-ink-2">Website check</dt>
                    <dd className="text-[0.9375rem] text-ink">{startup.website_status}</dd>
                  </div>
                )}
              </dl>
              <Link
                to="/startups/$id"
                params={{ id: startup.id }}
                className="inline-flex h-9 w-fit items-center gap-2 rounded-md border border-edge px-3 text-[0.875rem] font-medium text-ink no-underline hover:border-ink"
              >
                <ExternalLink className="size-4" aria-hidden />
                Open profile
              </Link>
            </div>
          )}
        </Station>
      </ol>
    </main>
  )
}

function Pager({ to, dir }: { to: { id: string; row_number: number } | null; dir: 'prev' | 'next' }) {
  const Icon = dir === 'prev' ? ArrowLeft : ArrowRight
  const cls = 'inline-flex h-9 items-center gap-2 rounded-md border border-edge px-3 text-[0.875rem] font-medium'
  if (!to)
    return (
      <span aria-disabled className={cn(cls, 'text-ink-2')}>
        {dir === 'prev' ? <Icon className="size-4" aria-hidden /> : null}
        {dir === 'prev' ? 'First row' : 'Last row'}
        {dir === 'next' ? <Icon className="size-4" aria-hidden /> : null}
      </span>
    )
  return (
    <Link to="/portal/trace/$rowId" params={{ rowId: to.id }} className={cn(cls, 'text-ink no-underline hover:border-ink')} aria-label={`${dir === 'prev' ? 'Previous' : 'Next'}: row ${to.row_number}`}>
      {dir === 'prev' && <Icon className="size-4" aria-hidden />}
      Row {to.row_number}
      {dir === 'next' && <Icon className="size-4" aria-hidden />}
    </Link>
  )
}

function Station({
  n,
  Icon,
  title,
  runId,
  time,
  summary,
  last,
  children,
}: {
  n: number
  Icon: LucideIcon
  title: string
  runId?: string | null
  time?: string | null
  summary: string
  last?: boolean
  children?: React.ReactNode
}) {
  return (
    <li className="grid grid-cols-[2.5rem_minmax(0,1fr)] gap-x-4">
      <div className="flex flex-col items-center" aria-hidden>
        <span className="grid size-10 place-items-center rounded-full border border-edge bg-surface text-ink">
          <Icon className="size-[18px]" strokeWidth={1.5} />
        </span>
        {!last && <span className="w-px flex-1 bg-edge" />}
      </div>
      <section aria-labelledby={`st-${n}`} className="mb-3 grid gap-4 rounded-lg border border-edge bg-surface p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
          <h2 id={`st-${n}`} className="font-sans text-[1rem] font-medium text-ink">
            <span className="me-2 text-ink-2 tabular-nums">{n}</span>
            {title}
          </h2>
          {runId && (
            <span className="flex items-center gap-3 text-[0.8125rem] text-ink-2">
              {time && <span className="tabular-nums">{time}</span>}
              <Link to="/portal/runs/$runId" params={{ runId }} className="text-glaze underline">
                Run <span className="font-mono">{runId.slice(-4)}</span>
              </Link>
            </span>
          )}
        </div>
        <p className="text-[0.9375rem] leading-6 text-ink">{summary}</p>
        {children}
      </section>
    </li>
  )
}

function RawRow({ data }: { data: Data }) {
  const { pretty, rawFields: entries } = data
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      {entries.length > 0 ? (
        <dl className="grid content-start gap-x-6 gap-y-2.5 sm:grid-cols-[9rem_minmax(0,1fr)]">
          {entries.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-[0.8125rem] text-ink-2">
                {fieldLabel(k)} <span className="font-mono">{k}</span>
              </dt>
              <dd className="text-[0.875rem] leading-6">
                <Value v={v} />
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="text-ink">The stored row is not valid JSON; it is shown as text.</p>
      )}
      <div className="grid content-start gap-2 rounded-md border border-edge bg-canvas">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-hairline px-3 py-2">
          <span className="text-[0.8125rem] font-medium text-ink-2">Raw JSON</span>
          <div className="flex flex-wrap items-center gap-2">
            <TraceCopy value={pretty} label="Copy JSON" />
            <Link
              to="/portal/database"
              search={{ table: 'source_rows', row: data.row.id }}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-edge px-2.5 text-[0.8125rem] font-medium text-ink no-underline hover:border-ink"
            >
              <Database className="size-3.5" aria-hidden />
              Open in database
            </Link>
          </div>
        </div>
        <pre className="max-h-[26rem] overflow-auto px-3 pb-3 font-mono text-[0.8125rem] leading-6 whitespace-pre-wrap break-words text-ink">{pretty}</pre>
        <div className="flex flex-wrap items-center gap-2 border-t border-hairline px-3 py-2">
          <span className="text-[0.8125rem] text-ink-2">Download hash</span>
          <code className="min-w-0 flex-1 truncate font-mono text-[0.8125rem] text-ink" title={data.row.content_hash}>
            {data.row.content_hash}
          </code>
          <TraceCopy value={data.row.content_hash} label="Copy hash" />
        </div>
      </div>
    </div>
  )
}

function MergeTable({ data }: { data: Data }) {
  const [all, setAll] = useState(false)
  const { merged, startup } = data
  if (!startup) return null
  const same = (f: keyof TraceValues) => {
    const vals = merged.map((m) => valueText(m.values[f]))
    return vals.every((v) => v === vals[0])
  }
  const differ = FIELDS.filter((f) => !same(f))
  const identical = FIELDS.filter(same)
  const shown = all ? FIELDS : differ
  return (
    <div className="grid gap-3">
      <div className="overflow-x-auto rounded-md border border-edge">
        <table className="w-full text-[0.875rem]">
          <thead className="bg-canvas text-[0.8125rem] text-ink-2">
            <tr>
              <th scope="col" className="px-4 py-2.5 text-start font-medium">
                Field
              </th>
              {merged.map((m) => (
                <th key={m.id} scope="col" className="px-4 py-2.5 text-start font-medium">
                  {m.id === data.row.id ? (
                    <span className="text-ink">Row {m.row_number} (this row)</span>
                  ) : (
                    <Link to="/portal/trace/$rowId" params={{ rowId: m.id }} className="text-glaze underline">
                      Row {m.row_number}
                    </Link>
                  )}
                </th>
              ))}
              <th scope="col" className="px-4 py-2.5 text-start font-medium">
                The startup keeps
              </th>
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 && (
              <tr className="border-t border-hairline">
                <td colSpan={merged.length + 2} className="px-4 py-3 text-ink">
                  Every field is identical across the rows.
                </td>
              </tr>
            )}
            {shown.map((f) => (
              <tr key={f} className={cn('border-t border-hairline align-top', !differ.includes(f) && 'text-ink')}>
                <th scope="row" className="px-4 py-3 text-start font-medium whitespace-nowrap text-ink">
                  {fieldLabel(f)}
                  {differ.includes(f) && <span className="ms-2 rounded-sm border border-edge border-s-2 border-s-ochre px-1.5 text-[0.8125rem] font-normal">differs</span>}
                </th>
                {merged.map((m) => (
                  <td key={m.id} className="max-w-[24rem] px-4 py-3 break-words">
                    <Value v={m.values[f]} />
                  </td>
                ))}
                <td className="max-w-[24rem] px-4 py-3 break-words">
                  <Value v={startup.values[f]} className="font-medium" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {identical.length > 0 && (
        <button
          type="button"
          aria-expanded={all}
          onClick={() => setAll((v) => !v)}
          className="inline-flex h-9 w-fit items-center gap-2 rounded-md border border-edge px-3 text-[0.875rem] font-medium text-ink hover:border-ink"
        >
          <ChevronDown className={cn('size-4 transition-transform motion-reduce:transition-none', all && 'rotate-180')} aria-hidden />
          {all ? 'Show only the fields that differ' : `Show ${plural(identical.length, 'identical field')}`}
        </button>
      )}
    </div>
  )
}

function Findings({ findings }: { findings: Data['findings'] }) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const decide = async (id: string, status: 'open' | 'resolved' | 'dismissed') => {
    setBusy(id)
    try {
      await setReviewStatus({ data: { ids: [id], status } })
      await router.invalidate()
    } finally {
      setBusy(null)
    }
  }
  const btn = 'inline-flex h-9 items-center gap-2 rounded-md border border-edge px-3 text-[0.875rem] font-medium text-ink hover:border-ink disabled:cursor-wait'
  return (
    <section aria-labelledby="findings-h" className="grid gap-3">
      <h2 id="findings-h" className="flex items-center gap-2 font-sans text-[0.9375rem] font-medium text-ink">
        <ListChecks className="size-4" aria-hidden />
        Findings on this row
      </h2>
      <ul className="grid gap-3 lg:grid-cols-2">
        {findings.map((f) => {
          const open = f.status === 'open'
          return (
            <li key={f.id} className={cn('grid gap-3 rounded-lg border border-edge bg-surface p-4', open ? 'border-s-4 border-s-ochre' : 'border-s-4 border-s-edge')}>
              <div className="grid gap-1">
                <p className="text-[0.9375rem] font-medium text-ink">{findingName(f.code)}</p>
                <p className="text-ink">{f.message}.</p>
              </div>
              {open ? (
                <div className="flex flex-wrap gap-2">
                  <button type="button" disabled={busy === f.id} onClick={() => decide(f.id, 'dismissed')} className={btn}>
                    Keep as a known gap
                  </button>
                  <button type="button" disabled={busy === f.id} onClick={() => decide(f.id, 'resolved')} className={btn}>
                    <CircleCheck className="size-4" aria-hidden />
                    Fixed at source
                  </button>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-ink">{f.status === 'resolved' ? 'Fixed at source.' : 'Kept as a known gap.'}</span>
                  <button type="button" disabled={busy === f.id} onClick={() => decide(f.id, 'open')} className={btn}>
                    <RotateCcw className="size-4" aria-hidden />
                    Reopen
                  </button>
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
