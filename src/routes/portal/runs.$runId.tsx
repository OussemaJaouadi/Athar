import {
  Link,
  createFileRoute,
  notFound,
  useRouter,
} from '@tanstack/react-router'
import { useEffect } from 'react'
import {
  findingName,
  labDuration,
  labTime,
  operationName,
  statusName,
} from '@/components/athar/lab'
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
  const router = useRouter()
  useEffect(() => {
    if (run.status !== 'running') return
    const timer = setInterval(() => router.invalidate(), 1000)
    return () => clearInterval(timer)
  }, [run.status, router])
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
          <span
            className={
              run.status === 'failed' ? 'text-destructive' : 'text-ink-2'
            }
          >
            {statusName(run.status)}
          </span>
        </div>
        <p className="mt-2 text-ink-2">
          Started {labTime(run.started_at)}
          {run.finished_at
            ? ` · ${labDuration(run.started_at, run.finished_at)}`
            : ''}
          {run.status !== 'running' &&
            (run.operation === 'prepare' ? ' · Finished work is saved.' : ' · Stored rows are kept.')}
        </p>
      </header>
      {failure && (
        <p role="alert" className="text-destructive">
          {operationName(run.operation)} failed: {failure}.{' '}
          <Link to="/portal/runs" className="underline">
            Try {operationName(run.operation)} again
          </Link>
          .
        </p>
      )}
      <ol className="grid divide-y divide-hairline border-y border-hairline">
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
                <span className="text-ink-2">: </span>
                {step.status === 'running' ? 'running…' : result}
                {step.status !== 'running' && step.finished_at && (
                  <span className="text-ink-2">, {labDuration(step.started_at, step.finished_at)}</span>
                )}
                {step.status !== 'done' && step.status !== 'running' && <span className="text-ink-2"> · {statusName(step.status)}</span>}
              </p>
              {step.status === 'failed' && (
                <p className="text-destructive">
                  {operationName(step.step)} failed: {step.message?.replace(/[.\s]+$/, '') ?? 'The operation stopped'}. Check the source and try Collect again.
                </p>
              )}
            </li>
          )
        })}
      </ol>
      {reviews.length > 0 && (
        <section>
          <h2 className="mb-3 text-xl font-medium">In review</h2>
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
                <span className="ms-3 text-ink-2 tabular-nums">
                  {finding.count} findings
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
