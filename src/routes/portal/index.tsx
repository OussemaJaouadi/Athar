import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { CircleAlert } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

import { CollectButton, duration, plural, shortId } from '@/components/athar/collect-button'
import { Desk, DeskBar, DeskEmpty, DeskItem, DeskPane, PaneSection, deskTd, deskTh, useDeskKeys } from '@/components/athar/desk'
import { labTime, operationName } from '@/components/athar/lab'
import { RunStatus } from '@/components/athar/run-status'
import { getPipeline, getRunDetail, type RunChange } from '#/server/api/portal'

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

// Collect reads the registry's rows and keeps the distinct ones as entries; Build turns entries into startups.
// clean and merge belong to runs made before pipeline v2.
const STEP_UNIT: Record<string, [string, string]> = {
  collect: ['rows', 'new entries'],
  build: ['entries', 'startups'],
  clean: ['rows', 'records'],
  merge: ['records', 'startups'],
}

const STEP_NAME: Record<string, string> = { build: 'Build' }
const stepName = (step: string) => STEP_NAME[step] ?? operationName(step)

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
          data.download
            ? [
                `Downloaded ${dateOnly(data.download.fetched_at)}`,
                `last checked ${dateOnly(data.download.last_checked_at)}`,
                plural(data.entries, 'entry', 'entries'),
                plural(data.startups, 'startup'),
                ...(data.withdrawn ? [`${data.withdrawn} withdrawn`] : []),
              ].join(' · ')
            : 'Nothing collected yet'
        }
        actions={<CollectButton running={!!running} again={!!data.download} />}
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
            <p className="px-4 py-3 text-[0.875rem] text-ink">No runs yet. Collect downloads the Startup Tunisia registry, keeps every distinct row and builds the startups from them.</p>
          )
        }
        pane={detail ? <RunPane detail={detail} position={`${ids.indexOf(detail.run.id) + 1} of ${ids.length}`} /> : <DeskEmpty>No run to show yet.</DeskEmpty>}
      />
    </main>
  )
}

type Detail = NonNullable<Awaited<ReturnType<typeof getRunDetail>>>

function RunPane({ detail, position }: { detail: Detail; position: string }) {
  const { run, steps } = detail
  const live = run.status === 'running'
  const now = useNow(live)
  const failed = run.status === 'failed' || run.status === 'interrupted'
  const failedStep = steps.find((s) => s.status === 'failed')
  const failure = (failedStep?.message ?? run.error)?.replace(/^.*?failed:\s*/i, '').replace(/[.\s]+$/, '')
  const nowIso = new Date(now).toISOString()
  const statement = live
    ? `Running · ${duration(run.started_at, nowIso) ?? '0.1 s'} so far`
    : failed
      ? `${failedStep ? `${stepName(failedStep.step)} failed` : run.status === 'interrupted' ? 'Interrupted' : 'Failed'} · ${labTime(run.started_at)}`
      : run.rows !== null && run.startups !== null
        ? `${plural(run.rows, 'row')} → ${plural(run.startups, 'startup')}`
        : run.change.kind === 'confirmed'
          ? 'Same rows as the last download'
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
                    {stepName(s.step)}
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

      {steps.some((st) => st.notes.length > 0) && (
        <PaneSection title="What the steps found">
          <div className="grid gap-4">
            {steps
              .filter((st) => st.notes.length > 0)
              .map((st) => (
                <div key={st.position} className="grid gap-1">
                  <p className="text-[0.8125rem] text-ink-2">{stepName(st.step)}</p>
                  <ul className="grid">
                    {st.notes.map((n) => (
                      <li key={n.code} className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-3 border-b border-hairline py-[7px] text-[0.875rem]">
                        <span className="text-end text-ink tabular-nums">{n.count.toLocaleString('en-GB')}</span>
                        <span className="text-ink">{n.text}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
          </div>
        </PaneSection>
      )}

      {!live && !failed && (
        <PaneSection title="What changed">
          <p className="text-[0.875rem] text-ink">{changeSentence(run.change)}</p>
        </PaneSection>
      )}
    </DeskPane>
  )
}

/** What a run did to the registry, as one plain sentence. */
function changeSentence(change: RunChange) {
  switch (change.kind) {
    case 'stored': {
      const parts = [
        `Stored download ${change.download} (${dateOnly(change.fetchedAt)}, ${plural(change.rows, 'row')})`,
        `${plural(change.entriesNew, 'new entry', 'new entries')}`,
        ...(change.entriesWithdrawn ? [`${plural(change.entriesWithdrawn, 'entry', 'entries')} no longer published`] : []),
      ]
      const s = change.startups
      const startups = s
        ? s.changed === 0 && s.unchanged === 0
          ? `${plural(s.created, 'startup')} built`
          : `startups: ${s.created} new, ${s.changed} changed, ${s.unchanged} unchanged`
        : null
      return `${parts.join(' · ')}${startups ? `; ${startups}` : ''}.`
    }
    case 'confirmed':
      return `The registry published the same rows as the download of ${change.sameAs ? dateOnly(change.sameAs) : 'the run before'}; nothing was stored, only its check time moved.`
    case 'legacy':
      return 'This run used the pipeline before v2. Its tables were replaced, so what it stored is no longer here.'
    default:
      return 'Nothing to compare.'
  }
}
