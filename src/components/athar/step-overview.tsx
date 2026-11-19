import { barX, barY, defineChart, text } from '@tanstack/charts'
import { motion } from '@tanstack/charts/motion'
import { Chart } from '@tanstack/charts/react/core'
import { scaleBand } from '@tanstack/charts/scales/band'
import { scaleLinear } from '@tanstack/charts/scales/linear'
import { useMemo } from 'react'

import { ChartSpace, axisText, chartTheme, useChartTokens, type ChartTokens } from '@/components/athar/chart-kit'
import { hasRows } from '@/components/athar/pipeline-facts'
import { cn } from '@/lib/utils'
import type { PipelineRun, RunNote } from '#/server/api/portal'
import type { StepState } from '#/server/pipeline/state'
import type { DownloadSummary } from '#/server/pipeline/facts'

/*
 * The one picture of each step, from what the page already has:
 * - Check websites, Prepare, Embed count "N of M done", where N can be less than M: a bar for each PART, with its count;
 * - Collect and Build are complete when they have run: a row of figures, and, once there is history, how the counts
 *   moved across downloads or runs.
 * Colour is a slot of the chart palette; every part also has its label and count, in the chart and in a table for screen readers.
 */

const n = (v: number) => v.toLocaleString('en-GB')
const pct = (a: number, b: number) => (b ? `${Math.max(1, Math.round((a / b) * 100))}%` : '0%')
const stamp = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

type Tone = 'done' | 'silent' | 'wait' | 'none'
export type Part = { key: string; label: string; count: number; tone: Tone; /** A counted fact that opens the rows behind this part. */ fact?: string }

const toneColour = (t: ChartTokens, tone: Tone) => (tone === 'done' ? t.glaze : tone === 'silent' ? t.ochre : tone === 'wait' ? t.ink2 : t.edge)

const sentence = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** The parts of a step whose work is "N of M done", from the selected run's counted facts and the step's own state. */
export function stepParts(step: StepState, notes: RunNote[]): { parts: Part[]; unit: string } | null {
  const note = (code: string) => notes.find((x) => x.code === code)
  const parts: Part[] = []
  let unit = 'items'
  if (step.operation === 'check') {
    unit = 'websites'
    const ok = note('reachable')
    const bad = note('unreachable')
    if (ok || bad) {
      const reasons = notes.filter((x) => x.code.startsWith('unreachable:')).sort((a, b) => b.count - a.count)
      const top = reasons.slice(0, 3)
      parts.push({ key: 'ok', label: 'Answered', count: ok?.count ?? 0, tone: 'done', fact: ok ? 'reachable' : undefined })
      for (const r of top) parts.push({ key: r.code, label: sentence(r.code.slice('unreachable:'.length)), count: r.count, tone: 'silent', fact: r.code })
      const rest = (bad?.count ?? 0) - top.reduce((a, r) => a + r.count, 0)
      if (rest > 0) parts.push({ key: 'rest', label: top.length ? 'Other reasons' : 'Did not answer', count: rest, tone: 'silent', fact: top.length ? undefined : 'unreachable' })
    } else parts.push({ key: 'current', label: 'Asked, current', count: step.current, tone: 'done' })
    if (step.missing > 0) parts.push({ key: 'missing', label: 'Never asked', count: step.missing, tone: 'wait' })
    if (step.outOfDate > 0) parts.push({ key: 'old', label: 'New address', count: step.outOfDate, tone: 'wait' })
  } else if (step.operation === 'prepare') {
    unit = 'descriptions'
    parts.push({ key: 'current', label: 'Prepared', count: step.current, tone: 'done' })
    if (step.outOfDate > 0) parts.push({ key: 'old', label: 'Changed since', count: step.outOfDate, tone: 'silent' })
    parts.push({ key: 'missing', label: 'Never prepared', count: step.missing, tone: 'wait' })
  } else if (step.operation === 'embed') {
    unit = 'startups'
    parts.push({ key: 'current', label: 'Embedded', count: step.current, tone: 'done' })
    if (step.outOfDate > 0) parts.push({ key: 'old', label: 'Out of date', count: step.outOfDate, tone: 'silent' })
    parts.push({ key: 'missing', label: 'Not embedded yet', count: step.missing, tone: 'wait' })
    const none = note('no_description')
    if (none) parts.push({ key: 'none', label: 'No description', count: none.count, tone: 'none', fact: 'no_description' })
  } else return null
  const shown = parts.filter((p) => p.count > 0)
  return shown.length ? { parts: shown, unit } : null
}

/** For screen readers: the same figures as a table. */
function DataTable({ caption, head, rows }: { caption: string; head: string[]; rows: (string | number)[][] }) {
  return (
    <div className="sr-only">
      <table>
        <caption>{caption}</caption>
        <thead>
          <tr>
            {head.map((h) => (
              <th key={h} scope="col">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (j === 0 ? <th key={j} scope="row">{c}</th> : <td key={j}>{c}</td>))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function useRenderer() {
  return useMemo(() => motion({ transition: { type: 'spring', stiffness: 220, damping: 28, mass: 1 } }), [])
}

/** Parts of one total: a bar each, labelled with its count and share, and a link to the rows where there are some. */
export function PartsChart({ parts, unit, onOpen }: { parts: Part[]; unit: string; onOpen: (fact: string) => void }) {
  const t = useChartTokens()
  const renderer = useRenderer()
  const total = parts.reduce((a, p) => a + p.count, 0)
  const max = Math.max(...parts.map((p) => p.count))
  const height = parts.length * 34 + 12
  const def = useMemo(() => {
    if (!t) return null
    const label = new Map(parts.map((p) => [p.key, p.label]))
    return defineChart({
      marks: [
        barX(parts, { id: 'parts', y: 'key', x: 'count', key: 'key', fill: (p) => toneColour(t, p.tone), inset: 5, radius: 2 }),
        text(parts, { y: 'key', x: 'count', text: (p) => `${n(p.count)} · ${pct(p.count, total)}`, anchor: 'start', dx: 8, fontSize: 13, fill: t.ink }),
      ],
      scales: {
        x: { scale: scaleLinear().domain([0, max]), axis: false },
        y: { scale: () => scaleBand<string>().domain(parts.map((p) => p.key)).padding(0.1), axis: { ...axisText, ticks: { format: (k: string) => label.get(k) ?? k } } },
      },
      theme: chartTheme(t, [t.glaze]),
      margin: { left: 150, right: 100, top: 2, bottom: 2 },
    })
  }, [t, JSON.stringify(parts)]) // eslint-disable-line react-hooks/exhaustive-deps
  const openable = parts.filter((p) => p.fact && hasRows(p.fact))
  const aria = `${n(total)} ${unit}: ${parts.map((p) => `${n(p.count)} ${p.label.toLowerCase()}`).join(', ')}.`
  return (
    <div data-picture="parts" data-total={total}>
      {def ? <Chart definition={def} renderer={renderer} height={height} ariaLabel={aria} /> : <ChartSpace h={height} />}
      <DataTable caption={`${n(total)} ${unit} by part`} head={['Part', 'Count', 'Share']} rows={parts.map((p) => [p.label, p.count, pct(p.count, total)])} />
      {openable.length > 0 && (
        <p className="mt-1 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[0.875rem] text-ink">
          <span className="text-ink-2">Open the rows</span>
          {openable.map((p) => (
            <button key={p.key} type="button" onClick={() => onOpen(p.fact!)} className="text-glaze underline underline-offset-4 tabular-nums">
              {n(p.count)} {p.label.toLowerCase()}
            </button>
          ))}
        </p>
      )}
    </div>
  )
}

export type Figure = { label: string; value: number; fact?: string }

/** A step that is simply complete: its figures in one row, ink on the page, the way a sentence would say them. */
export function Figures({ items, onOpen }: { items: Figure[]; onOpen: (fact: string) => void }) {
  return (
    <dl data-picture="figures" className="grid grid-cols-[repeat(auto-fit,minmax(9.5rem,1fr))] border-y border-edge">
      {items.map((f, i) => (
        <div key={f.label} className={cn('grid content-start gap-0.5 px-4 py-3', i > 0 && 'border-s border-hairline', i === 0 && 'ps-0')}>
          <dd className="order-1 text-[1.375rem] leading-7 font-medium text-ink tabular-nums">
            {f.fact && hasRows(f.fact) ? (
              <button type="button" onClick={() => onOpen(f.fact!)} className="text-glaze underline underline-offset-4">
                {n(f.value)}
              </button>
            ) : (
              n(f.value)
            )}
          </dd>
          <dt className="text-[0.8125rem] text-ink-2">{f.label}</dt>
        </div>
      ))}
    </dl>
  )
}

type Column = { key: string; label: string; parts: { state: string; count: number }[] }

/** How a count moved across downloads or runs: one column each, stacked when a column has parts, the total above it. */
function HistoryChart({ columns, states, ariaLabel, caption }: { columns: Column[]; states: { key: string; label: string; tone: Tone }[]; ariaLabel: string; caption: string }) {
  const t = useChartTokens()
  const renderer = useRenderer()
  const height = 220
  const def = useMemo(() => {
    if (!t) return null
    const data = columns.flatMap((c) => c.parts.map((p) => ({ key: c.key, state: p.state, count: p.count })))
    const totals = columns.map((c) => ({ key: c.key, total: c.parts.reduce((a, p) => a + p.count, 0) }))
    const tone = new Map(states.map((s) => [s.key, s.tone]))
    const label = new Map(columns.map((c) => [c.key, c.label]))
    return defineChart({
      marks: [
        barY(data, { id: 'history', x: 'key', y: 'count', z: 'state', key: (d) => `${d.key}-${d.state}`, fill: (d) => toneColour(t, tone.get(d.state) ?? 'wait'), stroke: t.canvas, strokeWidth: 1.5, inset: 18, maxThickness: 72 }),
        text(totals, { x: 'key', y: 'total', text: (d) => n(d.total), dy: -10, fontSize: 13, fill: t.ink }),
      ],
      scales: {
        x: { scale: () => scaleBand<string>().domain(columns.map((c) => c.key)).padding(0.1), axis: { ...axisText, ticks: { format: (k: string) => label.get(k) ?? k } } },
        y: { scale: scaleLinear, nice: true, grid: { stroke: t.hairline }, axis: { ...axisText, ticks: { format: (v: number) => (Number.isInteger(v) ? n(v) : '') } } },
      },
      theme: chartTheme(t, [t.glaze]),
      margin: { left: 48, top: 22 },
    })
  }, [t, JSON.stringify(columns)]) // eslint-disable-line react-hooks/exhaustive-deps
  const last = columns[columns.length - 1]
  return (
    <div data-picture="history">
      {def ? <Chart definition={def} renderer={renderer} height={height} ariaLabel={ariaLabel} /> : <ChartSpace h={height} />}
      {t && states.length > 1 && (
        <ul className="mt-1.5 flex flex-wrap gap-x-6 gap-y-1 text-[0.875rem] text-ink tabular-nums">
          {states.map((s) => (
            <li key={s.key} className="flex items-center gap-2">
              <span aria-hidden className="inline-block size-3 shrink-0" style={{ background: toneColour(t, s.tone) }} />
              <span className="font-medium">{n(last.parts.find((p) => p.state === s.key)?.count ?? 0)}</span>
              <span className="text-ink-2">{s.label.toLowerCase()} in the latest run</span>
            </li>
          ))}
        </ul>
      )}
      <DataTable
        caption={caption}
        head={['When', ...states.map((s) => s.label)]}
        rows={columns.map((c) => [c.label, ...states.map((s) => c.parts.find((p) => p.state === s.key)?.count ?? 0)])}
      />
    </div>
  )
}

/** The one picture of a step. `selected` is the run whose facts the pane shows. */
export function StepPicture({
  step,
  notes,
  selected,
  runs,
  downloads,
  onOpen,
}: {
  step: StepState
  notes: RunNote[]
  selected: PipelineRun | null
  runs: PipelineRun[]
  downloads: DownloadSummary[]
  onOpen: (fact: string) => void
}) {
  const split = stepParts(step, notes)
  if (split) return <PartsChart parts={split.parts} unit={split.unit} onOpen={onOpen} />

  if (step.operation === 'collect') {
    const note = (code: string) => notes.find((x) => x.code === code)?.count
    const latest = downloads[0]
    if (!latest) return null
    const copies = note('exact_copies') ?? Math.max(0, latest.rows - step.total)
    const figures: Figure[] = [
      { label: 'rows in the latest download', value: latest.rows },
      { label: 'distinct entries', value: step.total },
      { label: 'exact duplicate rows', value: copies, fact: copies > 0 ? 'exact_copies' : undefined },
      ...(downloads.length > 1 ? [{ label: 'new entries in the latest download', value: latest.entriesNew }] : []),
    ]
    const history = [...downloads].reverse().slice(-10)
    return (
      <div className="grid gap-4">
        <Figures items={figures} onOpen={onOpen} />
        {history.length > 1 && (
          <HistoryChart
            columns={history.map((d) => ({ key: String(d.id), label: day(d.fetchedAt), parts: [{ state: 'rows', count: d.rows }] }))}
            states={[{ key: 'rows', label: 'Rows', tone: 'done' }]}
            ariaLabel={`Rows per download, from ${n(history[0].rows)} on ${day(history[0].fetchedAt)} to ${n(history[history.length - 1].rows)} on ${day(history[history.length - 1].fetchedAt)}.`}
            caption="Rows in each download"
          />
        )}
      </div>
    )
  }

  if (step.operation === 'rebuild') {
    const run = selected
    const figures: Figure[] = []
    if (run?.startups != null) {
      figures.push({ label: 'entries read', value: step.total }, { label: 'startups built', value: run.startups })
      if (run.built) figures.push({ label: 'new', value: run.built.created }, { label: 'changed', value: run.built.changed }, { label: 'unchanged', value: run.built.unchanged })
    }
    const history = [...runs].filter((r) => r.built).reverse().slice(-8)
    return (
      <div className="grid gap-4">
        {figures.length > 0 && <Figures items={figures} onOpen={onOpen} />}
        {history.length > 1 && (
          <HistoryChart
            columns={history.map((r) => ({
              key: r.id,
              label: stamp(r.started_at),
              parts: [
                { state: 'unchanged', count: r.built!.unchanged },
                { state: 'changed', count: r.built!.changed },
                { state: 'created', count: r.built!.created },
              ],
            }))}
            states={[
              { key: 'unchanged', label: 'Unchanged', tone: 'none' },
              { key: 'changed', label: 'Changed', tone: 'silent' },
              { key: 'created', label: 'New', tone: 'done' },
            ]}
            ariaLabel={`Startups built in each of the last ${history.length} runs, split into unchanged, changed and new. The latest run built ${n(history[history.length - 1].startups ?? 0)}.`}
            caption="Startups built in each run, by what the run did to them"
          />
        )}
      </div>
    )
  }
  return null
}

/** Codes the picture already tells, so the facts list does not repeat them (the list keeps the rest). */
export function toldByPicture(step: StepState, notes: RunNote[]) {
  const told = new Set<string>()
  if (step.operation === 'collect') ['entries_new', 'exact_copies'].forEach((c) => told.add(c))
  else for (const p of stepParts(step, notes)?.parts ?? []) if (p.fact) told.add(p.fact)
  return told
}
