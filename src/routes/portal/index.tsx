import { Link, createFileRoute } from '@tanstack/react-router'
import { ChevronRight, Download, Eraser, ListChecks, Merge, type LucideIcon } from 'lucide-react'

import { CollectButton, diffSentence, duration, plural, shortId } from '@/components/athar/collect-button'
import { findingName, findingSentence, labTime, operationName } from '@/components/athar/lab'
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
      <main className="grid gap-6 p-4 lg:p-8">
        <h1 className="font-display text-[1.75rem] leading-9">Pipeline</h1>
        <section className="grid max-w-2xl gap-4 rounded-lg border border-edge bg-surface p-6">
          <p className="font-display text-[1.625rem] leading-9 text-ink">Nothing collected yet.</p>
          <p className="text-[0.9375rem] leading-6 text-ink">
            Collect downloads the Startup Tunisia registry, cleans every row and matches rows to startups. It takes a few seconds.
          </p>
          <CollectButton running={running} again={false} className="w-fit" />
        </section>
      </main>
    )

  const step = (id: string) => data.steps.find((s) => s.step === id)
  const took = (id: string) => duration(step(id)?.started_at ?? null, step(id)?.finished_at ?? null)
  const last = data.runs.find((r) => r.status === 'done' && r.operation === 'collect')
  const folded = data.cleaned - data.merged
  return (
    <main className="grid gap-10 p-4 lg:p-8">
      <header className="flex flex-wrap items-end justify-between gap-x-10 gap-y-5">
        <div className="grid max-w-[64rem] gap-3">
          <h1 className="font-display text-[1.75rem] leading-9">Pipeline</h1>
          <p className="font-display text-[1.625rem] leading-10 text-ink">
            Collected {labTime(data.snapshot.fetched_at)}: {plural(data.collected, 'row')} became {plural(data.merged, 'startup')}.{' '}
            {open > 0 ? (
              <>
                <Link to="/portal/review" className="text-glaze underline decoration-1">
                  {plural(open, 'finding')}
                </Link>{' '}
                {open === 1 ? 'is' : 'are'} waiting in Review.
              </>
            ) : (
              'Nothing is waiting in Review.'
            )}
          </p>
        </div>
        <div className="grid justify-items-end gap-2">
          <CollectButton running={running} again className="h-11 px-5 text-[0.9375rem]" />
          {last && <p className="text-[0.8125rem] text-ink-2">Last run took {duration(last.started_at, last.finished_at)}</p>}
        </div>
      </header>

      <section aria-label="Stages of the latest collect">
        <ol className="grid gap-3 lg:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr] lg:items-stretch lg:gap-2">
          <Station Icon={Download} label="Collect" time={took('collect')} value={data.collected} unit="source rows">
            <p>
              As downloaded: {(data.snapshot.byte_size / 1024).toFixed(0)} KB from <span className="break-all">{new URL(data.snapshot.url).hostname}</span>
            </p>
          </Station>
          <Arrow />
          <Station Icon={Eraser} label="Clean" time={took('clean')} value={data.cleaned} unit="records, originals kept">
            <ul className="grid gap-1">
              {data.cleanChanges
                .filter((c) => !HOUSEKEEPING.has(c.field))
                .map((c) => (
                  <li key={c.field + c.why}>
                    <span className="tabular-nums">{c.count}</span> {(FIELD[c.field] ?? [c.field, c.field])[c.count === 1 ? 0 : 1]}:{' '}
                    {c.why.charAt(0).toLowerCase() + c.why.slice(1)}
                  </li>
                ))}
              <li>Logo and industry dropped on every row: a placeholder image, and a copy of the sector</li>
            </ul>
          </Station>
          <Arrow />
          <Station Icon={Merge} label="Merge" time={took('merge')} value={data.merged} unit="startups">
            <p>
              {plural(folded, 'duplicate registration')} folded into the startup {folded === 1 ? 'it repeats' : 'they repeat'}.
            </p>
          </Station>
          <Arrow />
          <Station Icon={ListChecks} label="Review" value={open} unit={`open ${open === 1 ? 'finding' : 'findings'}`} to="/portal/review">
            <p>On {plural(data.inReview, 'record')}. Each is settled from its source or kept as a known gap.</p>
          </Station>
        </ol>
      </section>

      <div className="grid gap-10 xl:grid-cols-[minmax(0,1fr)_26rem]">
        <section aria-labelledby="runs-h" className="grid content-start gap-3">
          <h2 id="runs-h" className="font-sans text-[0.9375rem] font-medium text-ink">
            Runs
          </h2>
          <RunsTable runs={data.runs} />
        </section>
        <section aria-labelledby="wait-h" className="grid content-start gap-3">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="wait-h" className="font-sans text-[0.9375rem] font-medium text-ink">
              Waiting in Review
            </h2>
            <Link to="/portal/review" className="text-glaze underline">
              Open Review
            </Link>
          </div>
          {data.findings.length ? (
            <ul className="grid gap-3">
              {data.findings.map((f) => (
                <li key={f.code}>
                  <Link
                    to="/portal/review"
                    search={{ code: f.code }}
                    className="group grid grid-cols-[1fr_auto] items-start gap-x-4 gap-y-1 rounded-lg border border-edge bg-surface p-4 no-underline hover:border-ink"
                  >
                    <span className="text-[0.9375rem] font-medium text-ink group-hover:underline">{findingName(f.code)}</span>
                    <span className="row-span-2 font-display text-[1.75rem] leading-8 text-ink tabular-nums">{f.count}</span>
                    <span className="text-ink">{findingSentence(f.code)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-lg border border-edge bg-surface p-4 text-ink">Nothing open. Every finding is settled.</p>
          )}
        </section>
      </div>
    </main>
  )
}

function Station({
  Icon,
  label,
  time,
  value,
  unit,
  to,
  children,
}: {
  Icon: LucideIcon
  label: string
  time?: string | null
  value: number
  unit: string
  to?: '/portal/review'
  children: React.ReactNode
}) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-2 text-[0.8125rem] font-medium text-ink-2">
          <Icon className="size-4" strokeWidth={1.5} aria-hidden />
          {label}
        </span>
        {time && <span className="text-[0.8125rem] text-ink-2 tabular-nums">{time}</span>}
      </div>
      <p className="mt-3 flex flex-wrap items-baseline gap-x-2">
        <span className="font-display text-[2.75rem] leading-[3rem] text-ink tabular-nums">{value.toLocaleString('en-GB')}</span>
        <span className="text-[0.9375rem] text-ink">{unit}</span>
      </p>
      <div className="mt-3 border-t border-hairline pt-3 text-[0.875rem] leading-6 text-ink">{children}</div>
    </>
  )
  const box = 'block h-full rounded-lg border border-edge bg-surface p-5'
  return (
    <li>
      {to ? (
        <Link to={to} className={`${box} no-underline hover:border-ink`}>
          {body}
        </Link>
      ) : (
        <div className={box}>{body}</div>
      )}
    </li>
  )
}

function Arrow() {
  return (
    <li aria-hidden className="hidden place-items-center text-ink-2 lg:grid">
      <ChevronRight className="size-5" strokeWidth={1.5} />
    </li>
  )
}

function RunsTable({ runs }: { runs: PipelineRun[] }) {
  if (!runs.length) return <p className="rounded-lg border border-edge bg-surface p-4 text-ink">No runs yet.</p>
  return (
    <div className="overflow-x-auto rounded-lg border border-edge">
      <table className="w-full text-[0.875rem] tabular-nums">
        <thead className="bg-surface text-[0.8125rem] text-ink-2">
          <tr>
            {['Run', 'Status', 'Started', 'Took', 'Result', 'Since the run before', 'New findings'].map((h) => (
              <th key={h} scope="col" className="px-4 py-3 text-start font-medium whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {runs.map((run) => (
            <tr key={run.id} className="border-t border-hairline">
              <td className="px-4 py-3 whitespace-nowrap">
                <Link to="/portal/runs/$runId" params={{ runId: run.id }} className="text-glaze underline">
                  {operationName(run.operation)} <span className="font-mono">{shortId(run.id)}</span>
                </Link>
              </td>
              <td className="px-4 py-3">
                <RunStatus status={run.status} />
              </td>
              <td className="px-4 py-3 whitespace-nowrap text-ink">{labTime(run.started_at)}</td>
              <td className="px-4 py-3 whitespace-nowrap text-ink">{duration(run.started_at, run.finished_at) ?? 'Running'}</td>
              <td className="px-4 py-3 whitespace-nowrap text-ink">
                {run.error
                  ? run.error.replace(/[.\s]+$/, '')
                  : run.rows !== null && run.startups !== null
                    ? `${plural(run.rows, 'row')} → ${plural(run.startups, 'startup')}`
                    : '—'}
              </td>
              <td className="px-4 py-3 text-ink">{diffSentence(run.diff)}</td>
              <td className="px-4 py-3 text-ink">{run.findings}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
