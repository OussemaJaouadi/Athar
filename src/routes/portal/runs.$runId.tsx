import {
  Link,
  createFileRoute,
  notFound,
} from '@tanstack/react-router'
import {
  findingName,
  labDuration,
  labTime,
  operationName,
} from '@/components/athar/lab'
import { CircleAlert } from 'lucide-react'
import { RunStatus } from '@/components/athar/run-status'
import { getRun } from '#/server/api/portal'

export const Route = createFileRoute('/portal/runs/$runId')({
  loader: async ({ params }) => {
    const data = await getRun({ data: params.runId })
    if (!data) throw notFound()
    return data
  },
  component: RunPage,
})

function RunPage() {
  const { run, steps, reviews, sampleRowId } = Route.useLoaderData()
  const failure = run.error
    ?.replace(/^.*?failed:\s*/i, '')
    .replace(/[.\s]+$/, '')
  return (
    <main className="grid gap-6 p-4 lg:p-6">
      <Link to="/portal/runs" className="text-glaze underline">
        All runs
      </Link>
      <header>
        <div className="flex flex-wrap items-baseline gap-4">
          <h1 className="font-display text-[1.75rem] leading-9 font-medium">
            {operationName(run.operation)} run{' '}
            <span className="font-mono text-[1.375rem]" title={run.id}>
              {run.id.slice(-4)}
            </span>
          </h1>
          <RunStatus status={run.status} />
        </div>
        <p className="mt-2 text-ink">
          Started {labTime(run.started_at)}
          {run.finished_at
            ? ` · ${labDuration(run.started_at, run.finished_at)}`
            : ''}
          {run.status !== 'running' &&
            (run.operation === 'prepare' ? ' · Finished work is saved.' : ' · Stored rows are kept.')}
        </p>
      </header>
      {failure && (
        <p role="alert" className="flex items-start gap-2 border-s-2 border-destructive bg-surface px-3 py-2 text-ink">
          <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>
          {operationName(run.operation)} failed: {failure}.{' '}
          <Link to="/portal/runs" className="underline">
            Try {operationName(run.operation)} again
          </Link>
          .</span>
        </p>
      )}
      <ol className="grid divide-y divide-hairline border-y border-edge">
        {steps.map((step) => {
          const result =
            step.message === 'Not built yet'
              ? 'not built yet'
              : step.items_out === null
                ? 'no result yet'
                : step.step === 'collect'
                  ? `${step.items_out} source rows stored`
                  : step.step === 'clean'
                    ? `${step.items_out} of ${step.items_in ?? step.items_out} records cleaned`
                    : step.step === 'merge'
                      ? `${step.items_out} startups from ${step.items_in ?? '?'} records`
                      : `${step.items_out} done`
          return (
            <li key={step.position} className="grid gap-1 py-3">
              <p className="tabular-nums">
                <span className="font-medium">{operationName(step.step)}</span>
                <span>: </span>
                {step.status === 'running' ? 'running…' : result}
                {step.status !== 'running' && step.finished_at && (
                  <span>, {labDuration(step.started_at, step.finished_at)}</span>
                )}
                <RunStatus status={step.status} className="ms-2" />
              </p>
              {step.status === 'failed' && (
                <p className="flex items-start gap-2 border-s-2 border-destructive px-3 text-ink">
                  <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
                  {operationName(step.step)} failed: {step.message?.replace(/[.\s]+$/, '') ?? 'The operation stopped'}. Check the source and try Collect again.
                </p>
              )}
            </li>
          )
        })}
      </ol>
      {reviews.length > 0 && (
        <section>
          <h2 className="mb-3 font-sans text-[0.9375rem] font-medium text-ink">In review</h2>
          <ul className="grid gap-2">
            {reviews.map((finding) => (
              <li key={finding.code}>
                <Link
                  to="/portal/review"
                  search={{ code: finding.code }}
                  className="text-glaze underline"
                >
                  {findingName(finding.code)}
                </Link>
                <span className="ms-3 text-ink tabular-nums">
                  {finding.count} {finding.count === 1 ? 'finding' : 'findings'}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {sampleRowId && (
        <Link
          to="/portal/trace/$rowId"
          params={{ rowId: sampleRowId }}
          className="text-glaze underline"
        >
          Trace a source row from this run
        </Link>
      )}
    </main>
  )
}
