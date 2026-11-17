import { Link, createFileRoute, notFound } from '@tanstack/react-router'
import { ChevronRight, CircleAlert } from 'lucide-react'
import { useEffect, useState } from 'react'

import { CollectButton, diffSentence, duration, plural, shortId } from '@/components/athar/collect-button'
import { findingName, labTime, operationName } from '@/components/athar/lab'
import { OpsHeading, OpsPage, opsRow, opsTd, opsTh } from '@/components/athar/ops'
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
  const raised = reviews.reduce((t, r) => t + r.count, 0)

  return (
    <OpsPage
      title={
        <span className="inline-flex flex-wrap items-center gap-3">
          {operationName(run.operation)} run <span className="font-mono text-[1.125rem]">{shortId(run.id)}</span>
          <RunStatus status={run.status} />
        </span>
      }
      lede={
        <>
          Started {labTime(run.started_at)}
          {run.finished_at ? ` · took ${duration(run.started_at, run.finished_at)}` : ` · ${duration(run.started_at, new Date(now).toISOString())} so far`}
          {!running && !failed && run.rows !== null && run.startups !== null && ` · ${plural(run.rows, 'row')} → ${plural(run.startups, 'startup')} · ${diffSentence(run.diff)}`}
        </>
      }
      actions={!running && <CollectButton running={false} again />}
    >
      <nav aria-label="Breadcrumb" className="-order-1">
        <ol className="flex items-center gap-1 text-[0.8125rem]">
          <li>
            <Link to="/portal" className="text-glaze underline">
              Pipeline
            </Link>
          </li>
          <li aria-hidden className="text-ink-2">
            <ChevronRight className="size-3.5" />
          </li>
          <li aria-current="page" className="text-ink">
            {operationName(run.operation)} <span className="font-mono">{shortId(run.id)}</span>
          </li>
        </ol>
      </nav>

      {failed && (
        <section role="alert" className="flex items-start gap-2 rounded-md border border-edge border-s-2 border-s-destructive bg-surface px-3 py-2 text-[0.8125rem] text-ink">
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>
            <span className="font-medium">
              {failedStep ? `${operationName(failedStep.step)} failed.` : run.status === 'interrupted' ? 'The run was interrupted.' : 'The run failed.'}
            </span>{' '}
            {failure ? `${failure}.` : run.status === 'interrupted' ? 'The server stopped while the run was going.' : 'No message was recorded.'} The registry
            from the run before is unchanged.
          </p>
        </section>
      )}

      <section aria-labelledby="steps-h" className="grid gap-2">
        <OpsHeading id="steps-h">Steps</OpsHeading>
        <div className="overflow-x-auto rounded-lg border border-edge">
          <table className="w-full tabular-nums">
            <thead className="bg-surface">
              <tr>
                {['Step', 'Status', 'In', 'Out', 'Took', 'What happened'].map((h) => (
                  <th key={h} scope="col" className={opsTh}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {steps.map((s, i) => {
                const [inUnit, outUnit] = STEP_UNIT[s.step] ?? ['items', 'items']
                return (
                  <tr key={s.position} className={opsRow}>
                    <td className={`${opsTd} whitespace-nowrap`}>
                      <span className="me-2 text-ink-2">{i + 1}</span>
                      {operationName(s.step)}
                    </td>
                    <td className={opsTd}>
                      <RunStatus status={s.status} />
                    </td>
                    <td className={`${opsTd} whitespace-nowrap`}>{s.items_in !== null ? `${s.items_in.toLocaleString('en-GB')} ${inUnit}` : '—'}</td>
                    <td className={`${opsTd} whitespace-nowrap`}>{s.items_out !== null ? `${s.items_out.toLocaleString('en-GB')} ${outUnit}` : '—'}</td>
                    <td className={`${opsTd} whitespace-nowrap`}>
                      {s.status === 'running'
                        ? `${duration(s.started_at, new Date(now).toISOString()) ?? '0.1 s'} so far`
                        : (duration(s.started_at, s.finished_at) ?? '—')}
                    </td>
                    <td className={opsTd}>{s.message ?? (s.status === 'pending' ? 'Waiting for the step before' : '—')}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      {reviews.length > 0 && (
        <section aria-labelledby="found-h" className="grid max-w-xl gap-2">
          <OpsHeading id="found-h">{plural(raised, 'finding')} raised by this run</OpsHeading>
          <ul className="overflow-hidden rounded-lg border border-edge">
            {reviews.map((r, i) => (
              <li key={r.code} className={i ? 'border-t border-hairline' : ''}>
                <Link
                  to="/portal/review"
                  search={{ code: r.code }}
                  className="flex h-9 items-center justify-between gap-3 px-3 text-[0.8125rem] text-ink no-underline hover:bg-surface"
                >
                  <span className="truncate">{findingName(r.code)}</span>
                  <span className="tabular-nums">
                    {r.count}
                    <span className="ms-2 text-ink-2">{r.open === r.count ? 'all open' : `${r.open} open`}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </OpsPage>
  )
}
