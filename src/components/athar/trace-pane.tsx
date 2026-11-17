import { Link } from '@tanstack/react-router'
import { useState } from 'react'

import { duration } from '@/components/athar/collect-button'
import { DeskPane, Evidence, Fields, JsonBlock, PaneSection, ShortId, type DeskField, type EvidenceRow } from '@/components/athar/desk'
import { findingName, labTime } from '@/components/athar/lab'
import { fieldLabel, plural, valueText } from '@/components/athar/trace-parts'
import type { getTraceRow, TraceValues } from '#/server/api/trace'

export type TraceData = NonNullable<Awaited<ReturnType<typeof getTraceRow>>>

// Which raw field a finding is about, so its value carries the ochre bar.
const FINDING_FIELD: Record<string, string> = {
  website_unrepairable: 'website',
  missing_description: 'desc',
  industry_differs: 'industry',
  cohort_unreadable: 'label',
  cohort_before_creation: 'label',
}

// Changes every row gets: said in the Why column, never hidden.
const CLEAN_ACTION = (from: string | null, to: string | null) => (to === null || to === '' ? (from ? 'Dropped' : 'Left empty') : to === from ? 'Kept' : to)

const MERGE_FIELDS: { key: keyof TraceValues; label: string }[] = [
  { key: 'name', label: 'Name' },
  { key: 'sector', label: 'Sector' },
  { key: 'website', label: 'Website' },
  { key: 'founders', label: 'Founders' },
  { key: 'cohort', label: 'Label date' },
  { key: 'creation_year', label: 'Founded' },
  { key: 'description', label: 'Description' },
]

function RunLink({ runId, took }: { runId: string | null; took: string | null }) {
  if (!runId) return null
  return (
    <span className="inline-flex items-baseline gap-3 tabular-nums">
      {took && <span>{took}</span>}
      <Link to="/portal/runs/$runId" params={{ runId }} className="text-glaze underline">
        Run <span className="font-mono">{runId.slice(-4)}</span>
      </Link>
    </span>
  )
}

/** One source row followed from the download to its startup, as the desk's pane. */
export function TracePane({ data, foot }: { data: TraceData; foot?: React.ReactNode }) {
  const [identical, setIdentical] = useState(false)
  const { row, record, changes, startup, merged, findings, steps } = data
  const name = record?.name ?? (data.rawFields.find(([k]) => k === 'name')?.[1] || 'Unnamed source row')
  const open = findings.filter((f) => f.status === 'open')
  const badFields = new Set(open.map((f) => FINDING_FIELD[f.code]).filter(Boolean))
  const took = (id: string) => {
    const s = steps.find((x) => x.step === id)
    return s ? duration(s.started_at, s.finished_at) : null
  }

  const evidence: EvidenceRow[] = changes.map((c) => ({
    field: fieldLabel(c.field),
    wrote: c.from ?? '',
    cleaning: CLEAN_ACTION(c.from, c.to),
    why: c.why,
    bad: badFields.has(c.field),
  }))
  // A finding on a field cleaning did not touch still shows what the registry wrote.
  for (const f of badFields) {
    if (changes.some((c) => c.field === f)) continue
    const raw = data.rawFields.find(([k]) => k === f)?.[1] ?? ''
    evidence.unshift({ field: fieldLabel(f), wrote: raw, cleaning: 'Kept', why: open.find((o) => FINDING_FIELD[o.code] === f)?.message ?? '', bad: true })
  }

  const same = (k: keyof TraceValues) => new Set(merged.map((m) => valueText(m.values[k]))).size <= 1
  const differ = MERGE_FIELDS.filter((f) => !same(f.key))
  const shown = identical ? MERGE_FIELDS : differ

  const startupFields: DeskField[] = startup
    ? [
        { label: 'Name', value: startup.values.name },
        { label: 'Sector', value: startup.values.sector },
        { label: 'Website', value: startup.values.website, mono: true },
        { label: 'Website check', value: startup.website_status ?? 'Not checked yet' },
        { label: 'Founders', value: valueText(startup.values.founders) },
        { label: 'Label date', value: startup.values.cohort },
        { label: 'Founded', value: startup.values.creation_year },
        { label: 'Description', value: startup.values.description },
      ]
    : []

  return (
    <DeskPane
      title={`Row ${row.row_number} · ${name}`}
      statement={open.length ? open.map((f) => findingName(f.code)).join(' · ') : (record?.sector ?? 'Not cleaned yet')}
      position={`${row.row_number} of ${data.lastRow}`}
      foot={foot}
    >
      <PaneSection title="Collected" aside={<RunLink runId={row.run_id} took={took('collect')} />}>
        <Fields
          fields={[
            { label: 'Downloaded', value: labTime(row.fetched_at) },
            { label: 'Source', value: row.url, mono: true },
            { label: 'Fields', value: plural(data.rawFields.length, 'field') },
            { label: 'Download hash', value: <ShortId id={row.content_hash} /> },
          ]}
        />
      </PaneSection>

      <PaneSection title="Cleaned" aside={<RunLink runId={row.run_id} took={took('clean')} />}>
        {evidence.length ? <Evidence rows={evidence} /> : <p className="text-[0.875rem] text-ink">Cleaning changed nothing on this row.</p>}
      </PaneSection>

      <PaneSection title="Merged" aside={<RunLink runId={row.run_id} took={took('merge')} />}>
        {merged.length <= 1 ? (
          <p className="text-[0.875rem] text-ink">The only registration of {name}.</p>
        ) : (
          <div className="grid gap-2">
            <p className="text-[0.875rem] text-ink">
              {plural(merged.length, 'registration')} of {name}, merged into one startup.{' '}
              {differ.length ? `${plural(differ.length, 'field')} differ.` : 'Every field is identical.'}
            </p>
            {shown.length > 0 && (
              <div className="overflow-x-auto border border-edge">
                <table className="w-full border-collapse">
                  <thead>
                    <tr>
                      <th className="h-[34px] w-[150px] border-b border-edge px-3 text-start text-[0.8125rem] font-normal text-ink-2">Field</th>
                      {merged.map((m) => (
                        <th key={m.id} className="h-[34px] border-b border-edge px-3 text-start text-[0.8125rem] font-normal text-ink-2 tabular-nums">
                          {m.id === row.id ? `Row ${m.row_number} (this row)` : `Row ${m.row_number}`}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((f) => (
                      <tr key={f.key}>
                        <td className="border-b border-hairline px-3 py-2 text-[0.8125rem] text-ink-2">{f.label}</td>
                        {merged.map((m) => {
                          const t = valueText(m.values[f.key])
                          return (
                            <td key={m.id} className="border-b border-hairline px-3 py-2 text-[0.875rem] [overflow-wrap:anywhere] text-ink">
                              {t || <span className="text-ink-3">empty</span>}
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {differ.length < MERGE_FIELDS.length && (
              <button type="button" onClick={() => setIdentical((v) => !v)} className="w-fit text-[0.875rem] text-glaze underline">
                {identical ? 'Only the fields that differ' : `Show ${plural(MERGE_FIELDS.length - differ.length, 'identical field')}`}
              </button>
            )}
          </div>
        )}
      </PaneSection>

      <PaneSection title="Startup">
        {startup ? (
          <div className="grid gap-2">
            <Fields fields={startupFields} />
            <Link to="/startups/$id" params={{ id: startup.id }} className="w-fit text-[0.875rem] text-glaze underline">
              Open the startup profile
            </Link>
          </div>
        ) : (
          <p className="text-[0.875rem] text-ink">Not merged into a startup yet.</p>
        )}
      </PaneSection>

      <PaneSection
        title={`Row ${row.row_number} as downloaded`}
        aside={
          <Link to="/portal/database" search={{ table: 'source_rows', row: row.id }} className="text-glaze underline">
            Open in database
          </Link>
        }
      >
        <JsonBlock text={data.pretty} title={data.rawValid ? 'raw_json' : 'raw_json (not valid JSON, shown as stored)'} />
      </PaneSection>
    </DeskPane>
  )
}
