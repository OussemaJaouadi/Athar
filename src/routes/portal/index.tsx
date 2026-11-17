import { Link, createFileRoute } from '@tanstack/react-router'
import { ChevronRight, Download, Eraser, ListChecks, Merge, type LucideIcon } from 'lucide-react'

import { CollectButton, diffSentence, duration, plural, shortId } from '@/components/athar/collect-button'
import { findingName, labTime, operationName } from '@/components/athar/lab'
import { OpsHeading, OpsPage, opsRow, opsTd, opsTh } from '@/components/athar/ops'
import { RunStatus } from '@/components/athar/run-status'
import { getPipeline, type PipelineRun } from '#/server/api/portal'

export const Route = createFileRoute('/portal/')({
  loader: () => getPipeline(),
  component: Pipeline,
})

// Clean changes that touch every row are housekeeping, not news: said once, in one line.
const HOUSEKEEPING = new Set(['logo', 'industry'])
const FIELD: Record<string, [string, string]> = {
  website: ['website', 'websites'],
  founders: ['founder list', 'founder lists'],
  name: ['name', 'names'],
  desc: ['description', 'descriptions'],
}

function Pipeline() {
  const data = Route.useLoaderData()
  const running = data.runs.some((r) => r.status === 'running')
  const open = data.findings.reduce((t, f) => t + f.count, 0)

  if (!data.snapshot)
    return (
      <OpsPage
        title="Pipeline"
        lede="Nothing collected yet. Collect downloads the Startup Tunisia registry, cleans every row and matches rows to startups."
        actions={<CollectButton running={running} again={false} />}
      >
        {null}
      </OpsPage>
    )

  const step = (id: string) => data.steps.find((s) => s.step === id)
  const took = (id: string) => duration(step(id)?.started_at ?? null, step(id)?.finished_at ?? null)
  const folded = data.cleaned - data.merged
  return (
    <OpsPage
      title="Pipeline"
      lede={
        <>
          Collected {labTime(data.snapshot.fetched_at)}: {plural(data.collected, 'row')} became {plural(data.merged, 'startup')}.{' '}
          {open > 0 ? (
            <>
              <Link to="/portal/review" className="text-glaze underline">
                {plural(open, 'finding')}
              </Link>{' '}
              {open === 1 ? 'is' : 'are'} waiting in Review.
            </>
          ) : (
            'Nothing is waiting in Review.'
          )}
        </>
      }
      actions={<CollectButton running={running} again />}
    >
      <section aria-label="Stages of the latest collect">
        <ol className="grid overflow-hidden rounded-lg border border-edge bg-surface lg:grid-cols-4">
          <Station Icon={Download} label="Collect" time={took('collect')} value={data.collected} unit="source rows">
            {(data.snapshot.byte_size / 1024).toFixed(0)} KB from {new URL(data.snapshot.url).hostname}
          </Station>
          <Station Icon={Eraser} label="Clean" time={took('clean')} value={data.cleaned} unit="records">
            <ul className="grid gap-0.5">
              {data.cleanChanges
                .filter((c) => !HOUSEKEEPING.has(c.field))
                .map((c) => (
                  <li key={c.field + c.why}>
                    {c.count} {(FIELD[c.field] ?? [c.field, c.field])[c.count === 1 ? 0 : 1]}: {c.why.charAt(0).toLowerCase() + c.why.slice(1)}
                  </li>
                ))}
            </ul>
          </Station>
          <Station Icon={Merge} label="Merge" time={took('merge')} value={data.merged} unit="startups">
            {plural(folded, 'duplicate registration')} folded in
          </Station>
          <Station Icon={ListChecks} label="Review" value={open} unit={open === 1 ? 'open finding' : 'open findings'} to="/portal/review" last>
            On {plural(data.inReview, 'record')}
          </Station>
        </ol>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <section aria-labelledby="runs-h" className="grid content-start gap-2">
          <OpsHeading id="runs-h">Runs</OpsHeading>
          <RunsTable runs={data.runs} />
        </section>
        <section aria-labelledby="wait-h" className="grid content-start gap-2">
          <OpsHeading
            id="wait-h"
            aside={
              <Link to="/portal/review" className="text-[0.8125rem] text-glaze underline">
                Open Review
              </Link>
            }
          >
            Waiting in Review
          </OpsHeading>
          {data.findings.length ? (
            <ul className="overflow-hidden rounded-lg border border-edge">
              {data.findings.map((f, i) => (
                <li key={f.code} className={i ? 'border-t border-hairline' : ''}>
                  <Link
                    to="/portal/review"
                    search={{ code: f.code }}
                    className="flex h-9 items-center justify-between gap-3 px-3 text-[0.8125rem] text-ink no-underline hover:bg-surface"
                  >
                    <span className="truncate">{findingName(f.code)}</span>
                    <span className="tabular-nums">{f.count}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[0.8125rem] text-ink">Nothing open.</p>
          )}
        </section>
      </div>
    </OpsPage>
  )
}

function Station({
  Icon,
  label,
  time,
  value,
  unit,
  to,
  last,
  children,
}: {
  Icon: LucideIcon
  label: string
  time?: string | null
  value: number
  unit: string
  to?: '/portal/review'
  last?: boolean
  children: React.ReactNode
}) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-3 text-[0.8125rem] text-ink-2">
        <span className="inline-flex items-center gap-1.5 font-medium">
          <Icon className="size-3.5" strokeWidth={1.75} aria-hidden />
          {label}
        </span>
        {time && <span className="tabular-nums">{time}</span>}
      </div>
      <p className="mt-1.5 flex items-baseline gap-1.5">
        <span className="font-display text-[1.75rem] leading-9 text-ink tabular-nums">{value.toLocaleString('en-GB')}</span>
        <span className="text-[0.8125rem] text-ink">{unit}</span>
      </p>
      <div className="mt-1 text-[0.8125rem] leading-5 text-ink">{children}</div>
    </>
  )
  const box = 'relative block h-full p-4'
  return (
    <li className={last ? 'relative' : 'relative border-b border-hairline lg:border-e lg:border-b-0'}>
      {to ? (
        <Link to={to} className={`${box} no-underline hover:bg-surface-raised`}>
          {body}
        </Link>
      ) : (
        <div className={box}>{body}</div>
      )}
      {!last && (
        <ChevronRight
          aria-hidden
          className="absolute top-1/2 -right-2 z-10 hidden size-4 -translate-y-1/2 rounded-full bg-surface text-ink-2 lg:block"
        />
      )}
    </li>
  )
}

function RunsTable({ runs }: { runs: PipelineRun[] }) {
  if (!runs.length) return <p className="text-[0.8125rem] text-ink">No runs yet.</p>
  return (
    <div className="overflow-x-auto rounded-lg border border-edge">
      <table className="w-full tabular-nums">
        <thead className="bg-surface">
          <tr>
            {['Run', 'Status', 'Started', 'Took', 'Result', 'Since the run before', 'New findings'].map((h) => (
              <th key={h} scope="col" className={opsTh}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {runs.map((run) => (
            <tr key={run.id} className={opsRow}>
              <td className={`${opsTd} whitespace-nowrap`}>
                <Link to="/portal/runs/$runId" params={{ runId: run.id }} className="text-glaze underline">
                  {operationName(run.operation)} <span className="font-mono">{shortId(run.id)}</span>
                </Link>
              </td>
              <td className={opsTd}>
                <RunStatus status={run.status} />
              </td>
              <td className={`${opsTd} whitespace-nowrap`}>{labTime(run.started_at)}</td>
              <td className={`${opsTd} whitespace-nowrap`}>{duration(run.started_at, run.finished_at) ?? 'Running'}</td>
              <td className={`${opsTd} whitespace-nowrap`}>
                {run.error
                  ? run.error.replace(/[.\s]+$/, '')
                  : run.rows !== null && run.startups !== null
                    ? `${plural(run.rows, 'row')} → ${plural(run.startups, 'startup')}`
                    : '—'}
              </td>
              <td className={opsTd}>{diffSentence(run.diff)}</td>
              <td className={opsTd}>{run.findings}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
