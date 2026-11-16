import { Link, createFileRoute } from '@tanstack/react-router'
import {
  StageStrip,
  findingName,
  findingSentence,
  operationName,
  statusName,
  labTime,
} from '@/components/athar/lab'
import { getPortalOverview } from '#/server/api/portal'

export const Route = createFileRoute('/portal/')({
  loader: () => getPortalOverview(),
  component: Overview,
})

function Overview() {
  const data = Route.useLoaderData()
  return (
    <main className="grid gap-6 p-4 lg:p-6">
      <header>
        <h1 className="font-display text-[1.75rem] leading-9 font-medium">
          Overview
        </h1>
        <p className="mt-1 text-ink-2">
          {data.snapshot
            ? `Latest snapshot · ${labTime(data.snapshot.fetched_at)}`
            : 'Nothing collected yet. Start by downloading the registry.'}
        </p>
      </header>
      <StageStrip {...data} openFindings={data.findings.reduce((t, f) => t + f.count, 0)} />
      <div className="grid gap-8 lg:grid-cols-2">
        <section>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="font-display text-xl">In review</h2>
            <Link to="/portal/review" className="text-glaze underline">
              Open in review
            </Link>
          </div>
          {data.findings.length ? (
            <ul className="divide-y divide-hairline border-y border-hairline">
              {data.findings.map((finding) => (
                <li key={finding.code} className="py-3">
                  <Link
                    to="/portal/review"
                    search={{ code: finding.code }}
                    className="flex justify-between gap-3 text-glaze underline"
                  >
                    <span>{findingName(finding.code)}</span>
                    <span className="text-ink tabular-nums">
                      {finding.count} findings
                    </span>
                  </Link>
                  <p className="mt-1 text-ink-2">
                    {findingSentence(finding.code)}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-ink-2">No open findings.</p>
          )}
        </section>
        <section>
          <div className="mb-3 flex justify-between">
            <h2 className="font-display text-xl">Recent runs</h2>
            <Link to="/portal/runs" className="text-glaze underline">
              View runs
            </Link>
          </div>
          <ul className="divide-y divide-hairline border-y border-hairline">
            {data.runs.map((run) => (
              <li
                key={run.id}
                className="flex flex-wrap items-center gap-4 py-3"
              >
                <Link
                  to="/portal/runs/$runId"
                  params={{ runId: run.id }}
                  className="text-glaze underline"
                >
                  {operationName(run.operation)}
                </Link>
                <span>{statusName(run.status)}</span>
                <time className="ms-auto text-ink-2" dateTime={run.started_at}>
                  {labTime(run.started_at)}
                </time>
              </li>
            ))}
          </ul>
          {!data.runs.length && <p className="py-3 text-ink-2">No runs yet.</p>}
        </section>
      </div>
      <section className="border-t border-hairline pt-5">
        <h2 className="font-display text-xl">What to do next</h2>
        <ol className="mt-3 grid max-w-[70ch] list-decimal gap-3 ps-5">
          {nextSteps(data).map((step) => (
            <li key={step.text} className="ps-1">
              {step.to ? (
                <Link to={step.to} className="text-glaze underline">
                  {step.text}
                </Link>
              ) : (
                step.text
              )}
              {step.note && <span className="block text-ink-2">{step.note}</span>}
            </li>
          ))}
        </ol>
      </section>
    </main>
  )
}

type Overview = Awaited<ReturnType<typeof getPortalOverview>>

// Next steps follow the state: what is done is not offered again as if it were not.
function nextSteps(data: Overview): { text: string; note?: string; to?: '/portal/runs' | '/portal/review' | '/portal/keys' }[] {
  const open = data.findings.reduce((t, f) => t + f.count, 0)
  const steps: { text: string; note?: string; to?: '/portal/runs' | '/portal/review' | '/portal/keys' }[] = []
  if (!data.snapshot) steps.push({ text: 'Collect the registry', note: 'It downloads the Startup Tunisia registry, cleans every row and matches rows to startups.', to: '/portal/runs' })
  if (open > 0) steps.push({ text: `Review ${open} open findings on ${data.inReview} records`, note: 'Each one is either settled from its source or left as a known gap.', to: '/portal/review' })
  if (data.keys === 0) steps.push({ text: 'Add a key', note: 'Prepare will use it to clean descriptions, once Prepare is built.', to: '/portal/keys' })
  if (data.snapshot) steps.push({ text: 'Collect again to refresh the registry', note: data.lastCollect?.finished_at ? `Last collected ${labTime(data.lastCollect.finished_at)}.` : undefined, to: '/portal/runs' })
  return steps
}
