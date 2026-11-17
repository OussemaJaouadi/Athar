import { Link, createFileRoute, notFound } from '@tanstack/react-router'
import { ChevronRight, CircleAlert } from 'lucide-react'
import { useEffect, useState } from 'react'

import { CollectButton, diffSentence, duration, plural, shortId } from '@/components/athar/collect-button'
import { findingName, labTime, operationName } from '@/components/athar/lab'
import { RunStatus } from '@/components/athar/run-status'
import { getRunDetail } from '#/server/api/portal'

export const Route = createFileRoute('/portal/runs/$runId')({
  loader: async ({ params }) => {
    const data = await getRunDetail({ data: params.runId })
    if (!data) throw notFound()
    return data
  },
  component: RunPage,
})

// A clock for the step in flight; the portal's poller refreshes the data when a step changes.
function useNow(on: boolean) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!on) return
    const t = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(t)
  }, [on])
  return now
}

const STEP_UNIT: Record<string, [string, string]> = {
  collect: ['rows', 'rows stored'],
  clean: ['rows', 'records'],
  merge: ['records', 'startups'],
}

function RunPage() {
  const { run, steps, reviews } = Route.useLoaderData()
  const running = run.status === 'running'
  const now = useNow(running)
  const failed = run.status === 'failed' || run.status === 'interrupted'
  const failedStep = steps.find((s) => s.status === 'failed')
  const failure = (failedStep?.message ?? run.error)?.replace(/^.*?failed:\s*/i, '').replace(/[.\s]+$/, '')
  const opened = reviews.reduce((t, r) => t + r.count, 0)
  const name = `${operationName(run.operation)} ${shortId(run.id)}`

  return (
    <main className="grid gap-8 p-4 lg:p-8">
      <nav aria-label="Breadcrumb">
        <ol className="flex items-center gap-1.5 text-[0.875rem]">
          <li>
            <Link to="/portal" className="text-glaze underline">
              Pipeline
            </Link>
          </li>
          <li aria-hidden className="text-ink-2">
            <ChevronRight className="size-4" />
          </li>
          <li aria-current="page" className="text-ink">
            {operationName(run.operation)} <span className="font-mono">{shortId(run.id)}</span>
          </li>
        </ol>
      </nav>

      <header className="flex flex-wrap items-end justify-between gap-x-10 gap-y-4">
        <div className="grid gap-2">
          <div className="flex flex-wrap items-center gap-4">
            <h1 className="font-display text-[1.75rem] leading-9">
              {operationName(run.operation)} run <span className="font-mono text-[1.5rem]" title={run.id}>{shortId(run.id)}</span>
            </h1>
            <RunStatus status={run.status} />
          </div>
          <p className="text-[0.9375rem] text-ink">
            Started {labTime(run.started_at)}
            {run.finished_at
              ? ` · took ${duration(run.started_at, run.finished_at)}`
              : ` · ${duration(run.started_at, new Date(now).toISOString())} so far`}
          </p>
        </div>
        {!running && <CollectButton running={false} again />}
      </header>

      {failed && (
        <section role="alert" className="grid gap-2 rounded-lg border border-edge border-s-4 border-s-destructive bg-surface p-5">
          <p className="flex items-center gap-2 text-[0.9375rem] font-medium text-ink">
            <CircleAlert className="size-5 shrink-0" aria-hidden />
            {failedStep ? `${operationName(failedStep.step)} failed` : run.status === 'interrupted' ? 'The run was interrupted' : 'The run failed'}
          </p>
          <p className="text-ink">
            {failure ? `${failure}.` : run.status === 'interrupted' ? 'The server stopped while the run was going.' : 'No message was recorded.'} The registry
            from the run before is unchanged.
          </p>
        </section>
      )}

      {!running && !failed && (
        <section aria-label="What this run produced" className="grid gap-3 sm:grid-cols-3">
          <Figure value={run.rows !== null ? run.rows.toLocaleString('en-GB') : '—'} label="source rows collected" />
          <Figure value={run.startups !== null ? run.startups.toLocaleString('en-GB') : '—'} label="startups after merge" />
          <Figure value={diffSentence(run.diff)} label={run.diff?.first ? 'nothing before it to compare' : 'rows against the collect before'} small />
        </section>
      )}

      <section aria-labelledby="steps-h" className="grid gap-3">
        <h2 id="steps-h" className="font-sans text-[0.9375rem] font-medium text-ink">
          Steps
        </h2>
        <div className="overflow-x-auto rounded-lg border border-edge">
          <table className="w-full text-[0.875rem] tabular-nums">
            <thead className="bg-surface text-[0.8125rem] text-ink-2">
              <tr>
                {['Step', 'Status', 'In', 'Out', 'Took', 'What happened'].map((h) => (
                  <th key={h} scope="col" className="px-4 py-3 text-start font-medium whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {steps.map((s, i) => {
                const [inUnit, outUnit] = STEP_UNIT[s.step] ?? ['items', 'items']
                return (
                  <tr key={s.position} className="border-t border-hairline">
                    <td className="px-4 py-3 whitespace-nowrap text-ink">
                      <span className="me-2 text-ink-2">{i + 1}</span>
                      {operationName(s.step)}
                    </td>
                    <td className="px-4 py-3">
                      <RunStatus status={s.status} />
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-ink">{s.items_in !== null ? `${s.items_in.toLocaleString('en-GB')} ${inUnit}` : '—'}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-ink">{s.items_out !== null ? `${s.items_out.toLocaleString('en-GB')} ${outUnit}` : '—'}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-ink">
                      {s.status === 'running'
                        ? `${duration(s.started_at, new Date(now).toISOString()) ?? '0.1 s'} so far`
                        : (duration(s.started_at, s.finished_at) ?? '—')}
                    </td>
                    <td className="px-4 py-3 text-ink">{s.message ?? (s.status === 'pending' ? 'Waiting for the step before' : '—')}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      {reviews.length > 0 && (
        <section aria-labelledby="found-h" className="grid gap-3">
          <h2 id="found-h" className="font-sans text-[0.9375rem] font-medium text-ink">
            {plural(opened, 'finding')} raised by this run
          </h2>
          <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {reviews.map((r) => (
              <li key={r.code}>
                <Link
                  to="/portal/review"
                  search={{ code: r.code }}
                  className="group grid h-full grid-cols-[1fr_auto] items-start gap-x-4 gap-y-1 rounded-lg border border-edge bg-surface p-4 no-underline hover:border-ink"
                >
                  <span className="text-[0.9375rem] font-medium text-ink group-hover:underline">{findingName(r.code)}</span>
                  <span className="row-span-2 font-display text-[1.75rem] leading-8 text-ink tabular-nums">{r.count}</span>
                  <span className="text-ink">{r.open === r.count ? 'All still open' : `${r.open} still open`}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      <p className="sr-only" aria-live="polite">
        {name} {run.status}
      </p>
    </main>
  )
}

function Figure({ value, label, small }: { value: string; label: string; small?: boolean }) {
  return (
    <div className="rounded-lg border border-edge bg-surface p-5">
      <p className={small ? 'font-display text-[1.625rem] leading-[3rem] text-ink' : 'font-display text-[2.75rem] leading-[3rem] text-ink tabular-nums'}>{value}</p>
      <p className="mt-1 text-[0.9375rem] text-ink">{label}</p>
    </div>
  )
}
