import { barY, defineChart } from '@tanstack/charts'
import { Chart } from '@tanstack/charts/react'
import { scaleBand } from '@tanstack/charts/scales/band'
import { scaleLinear } from '@tanstack/charts/scales/linear'
import { tooltip } from '@tanstack/charts/tooltip'
import { Link, createFileRoute } from '@tanstack/react-router'
import { useMemo } from 'react'

import { PageHeader, Panel, SampleTag, shortDate } from '@/components/athar/kit'
import { RunStatus } from '@/components/athar/run-status'
import { cn } from '@/lib/utils'
import { getLabOverview } from '#/server/api/sample'

export const Route = createFileRoute('/portal/')({
  loader: () => getLabOverview(),
  component: Overview,
})

const time = (iso: string) => new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })

// Macro view: the pipeline as a line of stations, then what needs a human, then the meters.
function Overview() {
  const { snapshot, stations, reviewCodes, openReviews, runs, keys, usage } = Route.useLoaderData()
  const usageChart = useMemo(() => {
    const data = usage.flatMap((u) => [
      { day: u.day, kind: 'input', tokens: u.input },
      { day: u.day, kind: 'output', tokens: u.output },
    ])
    return defineChart({
      marks: [barY(data, { x: 'day', y: 'tokens', fill: (d: { kind: string }) => (d.kind === 'input' ? 'var(--color-zinc-700)' : 'var(--ochre)'), inset: 1 })],
      scales: { x: { scale: () => scaleBand<string>().padding(0.2) }, y: { scale: scaleLinear, nice: true, grid: true } },
      tooltip,
    })
  }, [usage])

  return (
    <main className="grid grid-cols-[minmax(0,1fr)] gap-4 p-4 lg:p-6">
      <PageHeader eyebrow="Overview" title="The pipeline today">
        {snapshot ? `Last snapshot ${time(snapshot.fetched_at)} · ${(snapshot.byte_size / 1024).toFixed(0)} KB · hash ${snapshot.content_hash.slice(0, 12)}` : 'Nothing collected yet.'}
      </PageHeader>

      <ol className="grid gap-px border border-hairline bg-hairline sm:grid-cols-5">
        {stations.map((s, i) => (
          <li key={s.id} className={cn('relative grid gap-1 bg-canvas px-4 py-3', s.sample && 'bg-[repeating-linear-gradient(135deg,transparent_0_6px,var(--surface)_6px_7px)]')}>
            <div className="flex items-center justify-between gap-2 font-mono text-[0.625rem] tracking-wide text-ink-2 uppercase">
              <span>
                {String(i + 1).padStart(2, '0')} · {s.label}
              </span>
              {s.sample && <SampleTag />}
            </div>
            <div className="font-display text-2xl font-semibold tabular-nums">{s.value}</div>
            <div className="text-xs text-ink-2">
              {s.unit} · {s.note}
            </div>
            {i < stations.length - 1 && <span aria-hidden className="absolute top-1/2 -end-1.5 z-10 hidden size-3 rotate-45 border-e border-t border-ochre bg-canvas sm:block" />}
          </li>
        ))}
      </ol>

        <Panel title="Next for the operator" bodyClassName="p-0">
          <ol className="grid divide-y divide-hairline sm:grid-cols-5 sm:divide-x sm:divide-y-0">
            {[
              { done: stations[0].value > 0, title: "Collect the registry", note: "Download, clean and merge", to: "/portal/runs" as const },
              { done: openReviews === 0, title: `Review  items`, note: "Missing descriptions, broken websites", to: "/portal/review" as const },
              { done: keys > 0, title: "Add an AI key", note: "OpenRouter or Groq free keys work", to: "/portal/keys" as const },
              { done: !stations[3].sample, title: "Prepare texts", note: "Not built yet: shown as sample", to: "/portal/runs" as const },
              { done: !stations[4].sample, title: "Embed the archive", note: "Not built yet: shown as sample", to: "/portal/runs" as const },
            ].map((s, i) => (
              <li key={s.title}>
                <Link to={s.to} className="grid gap-0.5 px-4 py-3 no-underline hover:bg-surface">
                  <span className="flex items-center gap-2 font-mono text-[0.625rem] tracking-wide text-ink-2 uppercase">
                    <span className={cn("grid size-4 place-content-center rounded-full border text-[0.5625rem]", s.done ? "border-glaze bg-glaze text-glaze-ink" : "border-hairline")}>{s.done ? "✓" : i + 1}</span>
                    step {i + 1}
                  </span>
                  <span className={cn("text-sm", s.done ? "text-ink-2 line-through decoration-hairline" : "font-medium text-ink")}>{s.title}</span>
                  <span className="text-xs text-ink-2">{s.note}</span>
                </Link>
              </li>
            ))}
          </ol>
        </Panel>

      <div className="grid gap-4 xl:grid-cols-3">
        <Panel title="Needs a human" meta={<Link to="/portal/review">{openReviews} open →</Link>}>
          {reviewCodes.length === 0 ? (
            <p className="text-ink-2">Nothing waiting.</p>
          ) : (
            <ul className="grid gap-2">
              {reviewCodes.map((r) => (
                <li key={r.code}>
                  <Link to="/portal/review" search={{ code: r.code }} className="flex items-center justify-between gap-3 no-underline">
                    <span className="font-mono text-xs text-ink">{r.code}</span>
                    <span className="flex items-center gap-2">
                      <span className="h-1.5 bg-ochre" style={{ width: `${Math.max(6, (r.count / openReviews) * 120)}px` }} />
                      <span className="w-8 text-end font-mono text-xs tabular-nums">{r.count}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Recent runs" meta={<Link to="/portal/runs">all →</Link>} bodyClassName="p-0">
          <table className="w-full">
            <tbody>
              {runs.map((r) => (
                <tr key={r.id} className="border-b border-hairline last:border-0">
                  <td className="px-4 py-2">
                    <Link to="/portal/runs/$runId" params={{ runId: r.id }}>
                      {r.operation}
                    </Link>
                  </td>
                  <td className="px-2 py-2">
                    <RunStatus status={r.status} />
                  </td>
                  <td className="px-4 py-2 text-end font-mono text-[0.6875rem] text-ink-2">{shortDate(r.started_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {runs.length === 0 && <p className="p-4 text-ink-2">No runs yet.</p>}
        </Panel>

        <Panel title="AI tokens, last 14 days" meta={<><SampleTag /> <Link to="/portal/keys">{keys} keys →</Link></>}>
          <Chart definition={usageChart} height={170} initialWidth={420} ariaLabel="Tokens per day" />
          <div className="mt-2 flex gap-4 text-xs text-ink-2">
            <span className="flex items-center gap-1.5"><span className="size-2 bg-zinc-700" />input</span>
            <span className="flex items-center gap-1.5"><span className="size-2 bg-ochre" />output</span>
          </div>
        </Panel>
      </div>
    </main>
  )
}
