import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { CircleAlert } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

import { CollectButton, diffSentence, duration, plural, shortId } from '@/components/athar/collect-button'
import { Desk, DeskBar, DeskEmpty, DeskItem, DeskPane, PaneSection, deskTd, deskTh, useDeskKeys } from '@/components/athar/desk'
import { findingName, labTime, operationName } from '@/components/athar/lab'
import { RunStatus } from '@/components/athar/run-status'
import { getPipeline, getRunDetail } from '#/server/api/portal'

type Search = { run?: string }

export const Route = createFileRoute('/portal/')({
  validateSearch: (s: Record<string, unknown>): Search => ({ run: typeof s.run === 'string' && s.run ? s.run : undefined }),
  loaderDeps: ({ search }) => ({ run: search.run }),
  // The selected run: the one in the URL, else the run in flight, else the latest. The pane is never empty while
  // there are runs.
  loader: async ({ deps }) => {
    const data = await getPipeline()
    const id = deps.run ?? data.runs.find((r) => r.status === 'running')?.id ?? data.runs[0]?.id
    const detail = id ? await getRunDetail({ data: id }) : null
    return { data, detail }
  },
  component: Pipeline,
})

const dateOnly = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

const STEP_UNIT: Record<string, [string, string]> = {
  collect: ['rows', 'rows'],
  clean: ['rows', 'records'],
  merge: ['records', 'startups'],
}

// A clock for the run in flight; the portal's poller refreshes the data when a step changes state.
function useNow(on: boolean) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!on) return
    const t = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(t)
  }, [on])
  return now
}

function Pipeline() {
  const { data, detail } = Route.useLoaderData()
  const search = Route.useSearch()
  const navigate = useNavigate({ from: '/portal/' })
  const running = data.runs.find((r) => r.status === 'running')
  const open = data.findings.reduce((t, f) => t + f.count, 0)
  const selected = detail?.run.id
  const ids = data.runs.map((r) => r.id)

  const select = useCallback((id: string) => navigate({ search: { run: id }, replace: true }), [navigate])
  useDeskKeys({ ids, current: selected, select })

  // A run that starts while the page is open is selected, so its steps can be followed.
  const seen = useRef(running?.id)
  useEffect(() => {
    if (running && running.id !== seen.current) {
      seen.current = running.id
      select(running.id)
    }
  }, [running, select])

  return (
    <main className="flex min-h-0 flex-1 flex-col">
      <DeskBar
        title="Pipeline"
        facts={
          data.snapshot
            ? `Collected ${dateOnly(data.snapshot.fetched_at)} · ${plural(data.collected, 'row')} · ${plural(data.merged, 'startup')} · ${open} in review`
            : 'Nothing collected yet'
        }
        actions={<CollectButton running={!!running} again={!!data.snapshot} />}
      />
      <Desk
        storageKey="pipeline"
        showPaneOnNarrow={!!search.run}
        onBack={() => navigate({ search: {}, replace: true })}
        backLabel="All runs"
        list={
          data.runs.length ? (
            <div role="list" aria-label="Runs">
              {data.runs.map((r) => (
                <div role="listitem" key={r.id}>
                  <DeskItem
                    selected={r.id === selected}
                    onSelect={() => select(r.id)}
                    title={
                      <>
                        {operationName(r.operation)} <span className="font-mono">{shortId(r.id)}</span>
                      </>
                    }
                    detail={`${labTime(r.started_at)} · ${duration(r.started_at, r.finished_at) ?? 'running'}`}
                    end={<RunStatus status={r.status} />}
                  />
                </div>
              ))}
            </div>
          ) : (
            <p className="px-4 py-3 text-[0.875rem] text-ink">No runs yet. Collect downloads the Startup Tunisia registry, cleans every row and matches rows to startups.</p>
          )
        }
        pane={detail ? <RunPane detail={detail} position={`${ids.indexOf(detail.run.id) + 1} of ${ids.length}`} /> : <DeskEmpty>No run to show yet.</DeskEmpty>}
      />
    </main>
  )
}

type Detail = NonNullable<Awaited<ReturnType<typeof getRunDetail>>>

function RunPane({ detail, position }: { detail: Detail; position: string }) {
  const { run, steps, reviews } = detail
  const live = run.status === 'running'
  const now = useNow(live)
  const failed = run.status === 'failed' || run.status === 'interrupted'
  const failedStep = steps.find((s) => s.status === 'failed')
  const failure = (failedStep?.message ?? run.error)?.replace(/^.*?failed:\s*/i, '').replace(/[.\s]+$/, '')
  const nowIso = new Date(now).toISOString()
  const statement = live
    ? `Running · ${duration(run.started_at, nowIso) ?? '0.1 s'} so far`
    : failed
      ? `${failedStep ? `${operationName(failedStep.step)} failed` : run.status === 'interrupted' ? 'Interrupted' : 'Failed'} · ${labTime(run.started_at)}`
      : run.rows !== null && run.startups !== null
        ? `${plural(run.rows, 'row')} → ${plural(run.startups, 'startup')}`
        : labTime(run.started_at)

  return (
    <DeskPane
      title={
        <>
          {operationName(run.operation)} run <span className="font-mono text-[1.125rem] font-normal">{shortId(run.id)}</span>
        </>
      }
      statement={statement}
      position={position}
    >
      {failed && (
        <p role="alert" className="flex items-start gap-2 border-s-[3px] border-destructive ps-2.5 text-[0.875rem] text-ink">
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            {failure ? `${failure}.` : run.status === 'interrupted' ? 'The server stopped while the run was going.' : 'No message was recorded.'} The registry from the
            run before is unchanged.
          </span>
        </p>
      )}

      <PaneSection title="Steps" aside={`Started ${labTime(run.started_at)}${run.finished_at ? ` · took ${duration(run.started_at, run.finished_at)}` : ''}`}>
        <table className="w-full border-collapse tabular-nums">
          <thead>
            <tr>
              {['Step', 'Status', 'In → out', 'Took', 'What happened'].map((h) => (
                <th key={h} scope="col" className={deskTh}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {steps.map((s, i) => {
              const [inUnit, outUnit] = STEP_UNIT[s.step] ?? ['items', 'items']
              return (
                <tr key={s.position}>
                  <td className={`${deskTd} whitespace-nowrap`}>
                    <span className="me-2 text-ink-2">{i + 1}</span>
                    {operationName(s.step)}
                  </td>
                  <td className={deskTd}>
                    <RunStatus status={s.status} />
                  </td>
                  <td className={`${deskTd} whitespace-nowrap`}>
                    {s.items_in !== null ? `${s.items_in.toLocaleString('en-GB')} ${inUnit}` : '—'}
                    {s.items_out !== null && ` → ${s.items_out.toLocaleString('en-GB')} ${outUnit}`}
                  </td>
                  <td className={`${deskTd} whitespace-nowrap`}>
                    {s.status === 'running' ? `${duration(s.started_at, nowIso) ?? '0.1 s'} so far` : (duration(s.started_at, s.finished_at) ?? '—')}
                  </td>
                  <td className={deskTd}>{s.message ?? (s.status === 'pending' ? 'Waiting for the step before' : '—')}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </PaneSection>

      {!live && !failed && (
        <PaneSection title="What changed">
          <p className="text-[0.875rem] text-ink">
            {run.diff?.first
              ? 'First collect: there is no earlier registry to compare with.'
              : run.diff
                ? `${diffSentence(run.diff)} against the collect before.`
                : 'Nothing to compare.'}
          </p>
        </PaneSection>
      )}

      {reviews.length > 0 && (
        <PaneSection title={`Findings raised · ${reviews.reduce((t, r) => t + r.count, 0)}`}>
          <ul className="grid">
            {reviews.map((r) => (
              <li key={r.code} className="flex items-center justify-between gap-4 border-b border-hairline py-[7px] text-[0.875rem]">
                <Link to="/portal/review" className="text-glaze underline">
                  {findingName(r.code)}
                </Link>
                <span className="text-ink tabular-nums">
                  {r.count}
                  <span className="ms-2 text-[0.8125rem] text-ink-2">{r.open === r.count ? 'all open' : `${r.open} open`}</span>
                </span>
              </li>
            ))}
          </ul>
        </PaneSection>
      )}
    </DeskPane>
  )
}
