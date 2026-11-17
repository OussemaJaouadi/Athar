import { Link } from '@tanstack/react-router'
import { ChevronDown, CircleCheck, Database, RotateCcw } from 'lucide-react'
import { useState } from 'react'

import { findingName } from '@/components/athar/lab'
import { CopyIcon, FieldList, opsButton, opsGhost, opsTd, opsTh, opsRow } from '@/components/athar/ops'
import { Value, fieldLabel, valueText } from '@/components/athar/trace-parts'
import { cn } from '@/lib/utils'
import { setReviewStatus } from '#/server/api/portal'
import type { getTraceRow, TraceValues } from '#/server/api/trace'

export type TraceData = NonNullable<Awaited<ReturnType<typeof getTraceRow>>>

const FIELDS: (keyof TraceValues)[] = ['name', 'description', 'sector', 'website', 'founders', 'cohort', 'creation_year']
// Changes every row gets: said once, not listed as if they were about this startup.
const ROUTINE = new Set(['logo', 'industry'])

const plural = (k: number, one: string, many = `${one}s`) => `${k.toLocaleString('en-GB')} ${k === 1 ? one : many}`
const took = (s?: { started_at: string | null; finished_at: string | null }) => {
  if (!s?.started_at || !s.finished_at) return null
  return `${Math.max(0.1, (Date.parse(s.finished_at) - Date.parse(s.started_at)) / 1000).toFixed(1)} s`
}

/** The trace of one source row, as the drawer's body: findings, then the four stations separated by hairlines. */
export function TraceBody({ data, onOpen, onChanged }: { data: TraceData; onOpen: (rowId: string) => void; onChanged: () => void }) {
  const { row, record, changes, startup, merged, findings } = data
  const own = changes.filter((c) => !ROUTINE.has(c.field))
  const others = merged.length - 1
  const step = (id: string) => took(data.steps.find((s) => s.step === id))

  return (
    <div className="grid gap-4">
      {findings.length > 0 && <Findings findings={findings} onChanged={onChanged} />}

      <Station n={1} title="Collect" runId={row.run_id} time={step('collect')} summary="The row exactly as the registry gave it.">
        {data.rawFields.length > 0 ? (
          <FieldList fields={data.rawFields.map(([k, v]) => ({ label: fieldLabel(k), value: <Value v={v} />, copy: v }))} />
        ) : (
          <p className="text-[0.8125rem] text-ink">The stored row is not valid JSON; it is shown as text below.</p>
        )}
        <RawJson pretty={data.pretty} open={!data.rawValid} />
      </Station>

      <Station
        n={2}
        title="Clean"
        runId={row.run_id}
        time={step('clean')}
        summary={record ? (own.length ? `${plural(own.length, 'field')} changed; the original stays in the raw row.` : 'No field of this row needed a change.') : 'This row has not been cleaned.'}
      >
        {own.length > 0 && (
          <div className="overflow-x-auto rounded-md border border-edge">
            <table className="w-full">
              <thead className="bg-canvas">
                <tr>
                  {['Field', 'Before', 'After', 'Why'].map((h) => (
                    <th key={h} scope="col" className={opsTh}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {own.map((c, i) => (
                  <tr key={c.field + i} className={cn(opsRow, 'align-top')}>
                    <th scope="row" className={cn(opsTd, 'text-start font-medium whitespace-nowrap')}>
                      {fieldLabel(c.field)}
                    </th>
                    <td className={cn(opsTd, 'max-w-[16rem] font-mono break-words')}>
                      <Value v={c.from} />
                    </td>
                    <td className={cn(opsTd, 'max-w-[16rem] font-mono break-words')}>
                      <Value v={c.to} />
                    </td>
                    <td className={opsTd}>{c.why}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {changes.some((c) => ROUTINE.has(c.field)) && (
          <p className="text-[0.8125rem] text-ink">Like every row: placeholder logo dropped, industry folded into sector.</p>
        )}
      </Station>

      <Station
        n={3}
        title="Merge"
        runId={row.run_id}
        time={step('merge')}
        summary={
          startup
            ? others > 0
              ? `${plural(merged.length, 'registration')} of the same startup, folded into one.`
              : 'The only registration of this startup; nothing merged.'
            : 'Not matched to a startup.'
        }
      >
        {startup && others > 0 && <MergeTable data={data} onOpen={onOpen} />}
      </Station>

      <Station n={4} title="Startup" summary={startup ? 'What the reading room shows.' : 'No startup yet.'}>
        {startup && (
          <FieldList
            fields={[
              ...FIELDS.map((f) => ({ label: fieldLabel(f), value: <Value v={startup.values[f]} />, copy: valueText(startup.values[f]) })),
              ...(startup.website_status ? [{ label: 'Website check', value: startup.website_status }] : []),
            ]}
          />
        )}
      </Station>

      <div className="group flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-hairline pt-3 text-[0.8125rem]">
        <span className="text-ink-2">Download hash</span>
        <code className="min-w-0 flex-1 truncate font-mono text-ink" title={row.content_hash}>
          {row.content_hash}
        </code>
        <CopyIcon text={row.content_hash} label="download hash" always />
        <Link to="/portal/database" search={{ table: 'source_rows', row: row.id }} className={cn(opsButton, 'no-underline')}>
          <Database aria-hidden />
          Open in database
        </Link>
      </div>
    </div>
  )
}

function Station({
  n,
  title,
  runId,
  time,
  summary,
  children,
}: {
  n: number
  title: string
  runId?: string | null
  time?: string | null
  summary: string
  children?: React.ReactNode
}) {
  return (
    <section aria-labelledby={`st-${n}`} className="grid gap-2 border-t border-hairline pt-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4">
        <h3 id={`st-${n}`} className="font-sans text-[0.875rem] font-medium text-ink">
          <span className="me-1.5 text-ink-2 tabular-nums">{n}</span>
          {title}
        </h3>
        {runId && (
          <span className="flex items-center gap-3 text-[0.8125rem] text-ink-2">
            {time && <span className="tabular-nums">{time}</span>}
            <Link to="/portal/runs/$runId" params={{ runId }} className="text-glaze underline">
              Run <span className="font-mono">{runId.slice(-4)}</span>
            </Link>
          </span>
        )}
      </div>
      <p className="text-[0.8125rem] text-ink">{summary}</p>
      {children}
    </section>
  )
}

function RawJson({ pretty, open: start }: { pretty: string; open: boolean }) {
  const [open, setOpen] = useState(start)
  return (
    <div className="grid gap-2">
      <div className="flex items-center gap-1">
        <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)} className={opsGhost}>
          <ChevronDown className={cn('transition-transform motion-reduce:transition-none', open && 'rotate-180')} aria-hidden />
          Raw JSON
        </button>
        <CopyIcon text={pretty} label="raw JSON" always />
      </div>
      {open && (
        <pre className="max-h-80 overflow-auto rounded-md border border-edge bg-canvas p-3 font-mono text-[0.8125rem] leading-5 whitespace-pre-wrap break-words text-ink">
          {pretty}
        </pre>
      )}
    </div>
  )
}

function MergeTable({ data, onOpen }: { data: TraceData; onOpen: (rowId: string) => void }) {
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
    <div className="grid gap-2">
      <div className="overflow-x-auto rounded-md border border-edge">
        <table className="w-full">
          <thead className="bg-canvas">
            <tr>
              <th scope="col" className={opsTh}>
                Field
              </th>
              {merged.map((m) => (
                <th key={m.id} scope="col" className={opsTh}>
                  {m.id === data.row.id ? (
                    <span className="text-ink">Row {m.row_number} (this)</span>
                  ) : (
                    <button type="button" onClick={() => onOpen(m.id)} className="text-glaze underline">
                      Row {m.row_number}
                    </button>
                  )}
                </th>
              ))}
              <th scope="col" className={opsTh}>
                Startup keeps
              </th>
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 && (
              <tr className={opsRow}>
                <td colSpan={merged.length + 2} className={opsTd}>
                  Every field is identical across the rows.
                </td>
              </tr>
            )}
            {shown.map((f) => (
              <tr key={f} className={cn(opsRow, 'align-top')}>
                <th scope="row" className={cn(opsTd, 'text-start font-medium whitespace-nowrap')}>
                  {fieldLabel(f)}
                </th>
                {merged.map((m) => (
                  <td key={m.id} className={cn(opsTd, 'max-w-[14rem] break-words')}>
                    <Value v={m.values[f]} />
                  </td>
                ))}
                <td className={cn(opsTd, 'max-w-[14rem] break-words font-medium')}>
                  <Value v={startup.values[f]} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {identical.length > 0 && (
        <button type="button" aria-expanded={all} onClick={() => setAll((v) => !v)} className={cn(opsGhost, 'w-fit')}>
          <ChevronDown className={cn('transition-transform motion-reduce:transition-none', all && 'rotate-180')} aria-hidden />
          {all ? 'Only the fields that differ' : `Show ${plural(identical.length, 'identical field')}`}
        </button>
      )}
    </div>
  )
}

function Findings({ findings, onChanged }: { findings: TraceData['findings']; onChanged: () => void }) {
  const [busy, setBusy] = useState<string | null>(null)
  const decide = async (id: string, status: 'open' | 'resolved' | 'dismissed') => {
    setBusy(id)
    try {
      await setReviewStatus({ data: { ids: [id], status } })
      onChanged()
    } finally {
      setBusy(null)
    }
  }
  return (
    <section aria-labelledby="findings-h" className="grid gap-1.5">
      <h3 id="findings-h" className="font-sans text-[0.875rem] font-medium text-ink">
        Findings
      </h3>
      <ul className="grid">
        {findings.map((f) => {
          const open = f.status === 'open'
          return (
            <li
              key={f.id}
              className={cn('flex flex-wrap items-center gap-x-3 gap-y-1.5 border-s-2 py-1.5 ps-3', open ? 'border-s-ochre' : 'border-s-edge')}
            >
              <div className="min-w-0 flex-1 text-[0.8125rem]">
                <span className="font-medium text-ink">{findingName(f.code)}</span>
                <span className="text-ink"> · {open ? f.message : f.status === 'resolved' ? 'Fixed at source' : 'Kept as a known gap'}</span>
              </div>
              {open ? (
                <div className="flex gap-1.5">
                  <button type="button" disabled={busy === f.id} onClick={() => decide(f.id, 'dismissed')} className={opsButton}>
                    Keep
                  </button>
                  <button type="button" disabled={busy === f.id} onClick={() => decide(f.id, 'resolved')} className={opsButton}>
                    <CircleCheck aria-hidden />
                    Fixed
                  </button>
                </div>
              ) : (
                <button type="button" disabled={busy === f.id} onClick={() => decide(f.id, 'open')} className={opsGhost}>
                  <RotateCcw aria-hidden />
                  Reopen
                </button>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
