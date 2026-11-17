import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { ArrowRight, CircleAlert } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

import { CollectButton, RunMenu, duration, plural } from '@/components/athar/collect-button'
import { Desk, DeskBar, DeskEmpty, DeskItem, DeskPane, PaneSection, useDeskKeys } from '@/components/athar/desk'
import { labTime, operationName } from '@/components/athar/lab'
import { RunStatus } from '@/components/athar/run-status'
import { cn } from '@/lib/utils'
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
        actions={
          <>
            <RunMenu operations={data.operations} running={!!running} hasKey={data.hasKey} />
            <CollectButton running={!!running} again={!!data.download} />
          </>
        }
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
                    title={labTime(r.started_at)}
                    detail={`${operationName(r.operation)} · ${duration(r.started_at, r.finished_at) ?? 'running'}`}
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

// Short labels for the counted facts; the step's own sentence is the fallback (and the hover title).
const FACT: Record<string, string> = {
  no_description: 'no description',
  listed_more_than_once: 'listed more than once',
  exact_copies: 'exact duplicate rows',
  other_sector: 'listed under two sectors',
  other_name: 'listed under two names',
  second_website: 'two websites, first kept',
  website_text_removed: 'extra text removed from a website',
  website_unreadable: 'unreadable websites',
  label_unreadable: 'unreadable label dates',
  label_before_creation: 'labelled before founded',
  // check
  unreachable: 'did not answer, asked twice',
  moved: 'answered from another domain',
  turned: 'changed status since the last check',
  social_not_checked: 'social pages, not checked',
  no_website: 'no website in the registry',
  // embed and prepare
  embedded: 'embedded by this run',
  up_to_date: 'already up to date',
  from_prepared: 'embedded from a prepared text',
  removed: 'removed: no description any more',
  prepared: 'prepared by this run',
}
// Already told by the flow strip.
const IN_FLOW = new Set(['entries_new', 'reachable'])

// What each step takes in and gives out, for the flow strip. clean and merge belong to runs before pipeline v2.
const IN_UNIT: Record<string, string> = {
  collect: 'rows published',
  build: 'entries',
  check: 'websites',
  prepare: 'descriptions',
  embed: 'startups',
  clean: 'rows',
  merge: 'records',
}
const OUT_UNIT: Record<string, [string, string]> = {
  collect: ['entry', 'entries'],
  build: ['startup', 'startups'],
  check: ['answering', 'answering'],
  prepare: ['prepared', 'prepared'],
  embed: ['vector', 'vectors'],
  clean: ['record', 'records'],
  merge: ['startup', 'startups'],
}

function RunPane({ detail, position }: { detail: Detail; position: string }) {
  const { run, steps } = detail
  const live = run.status === 'running'
  const now = useNow(live)
  const nowIso = new Date(now).toISOString()
  const failed = run.status === 'failed' || run.status === 'interrupted'
  const failedStep = steps.find((s) => s.status === 'failed')
  const failure = (failedStep?.message ?? run.error)?.replace(/^.*?failed:\s*/i, '').replace(/[.\s]+$/, '')
  const took = run.finished_at ? duration(run.started_at, run.finished_at) : duration(run.started_at, nowIso)
  // In the order the steps wrote them, so "of those" lines stay under the line they detail.
  const facts = steps.flatMap((st) => st.notes.filter((n) => !IN_FLOW.has(n.code) && n.count > 0))
  const first = steps[0]

  return (
    <DeskPane
      title={`${operationName(run.operation)} · ${labTime(run.started_at)}`}
      statement={
        <span className="inline-flex items-center gap-1.5">
          <RunStatus status={run.status} />
          <span className="text-ink-2">{live ? `${took ?? '0.1 s'} so far` : took ? `in ${took}` : ''}</span>
        </span>
      }
      position={position}
    >
      {failed && (
        <p role="alert" className="flex items-start gap-2 border-s-[3px] border-destructive ps-2.5 text-[0.875rem] text-ink">
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            {failedStep ? `${stepName(failedStep.step)} failed: ` : ''}
            {failure ? `${failure}.` : run.status === 'interrupted' ? 'The server stopped while the run was going.' : 'No message was recorded.'} The registry from
            the run before is unchanged.
          </span>
        </p>
      )}

      {/* The flow: each number once, each step's time on its arrow. */}
      <ol aria-label="What the run did" className="flex flex-wrap items-center gap-x-1 gap-y-3 py-1">
        <li className="grid">
          <span className="font-display text-[1.75rem] leading-8 text-ink tabular-nums">{first?.items_in !== null && first?.items_in !== undefined ? first.items_in.toLocaleString('en-GB') : '—'}</span>
          <span className="text-[0.8125rem] text-ink-2">{(first && IN_UNIT[first.step]) ?? 'items'}</span>
        </li>
        {steps.map((st) => {
          const [one, many] = OUT_UNIT[st.step] ?? ['item', 'items']
          const t = st.status === 'running' ? duration(st.started_at, nowIso) : duration(st.started_at, st.finished_at)
          return (
            <li key={st.position} className="contents">
              <span aria-hidden className="mx-3 grid min-w-[7.5rem] justify-items-center text-[0.8125rem] text-ink-2">
                <span>
                  {stepName(st.step).toLowerCase()}
                  {t && ` · ${t}`}
                </span>
                <span className={cn('h-px w-full', st.status === 'done' ? 'bg-ink' : 'bg-edge')} />
                <ArrowRight className="-mt-[9px] size-4 self-end justify-self-end text-ink" />
              </span>
              <span className="grid">
                <span className="font-display text-[1.75rem] leading-8 text-ink tabular-nums">
                  {st.items_out !== null ? st.items_out.toLocaleString('en-GB') : st.status === 'running' ? '…' : '—'}
                </span>
                <span className="text-[0.8125rem] text-ink-2">
                  {st.items_out === 1 ? one : many}
                  {st.status !== 'done' && st.status !== 'running' && ` · ${st.status === 'failed' ? 'failed' : 'not run'}`}
                </span>
                <span className="sr-only">
                  {stepName(st.step)}: {st.message}
                </span>
              </span>
            </li>
          )
        })}
      </ol>

      {!live && !failed && run.operation === 'collect' && (
        <PaneSection title="What changed">
          <p className="text-[0.875rem] text-ink">{changeSentence(run.change)}</p>
        </PaneSection>
      )}

      {facts.length > 0 && (
        <PaneSection title="What the data showed">
          <ul className="grid max-w-[880px] gap-x-10 md:grid-cols-2">
            {facts.map((n) => (
              <li key={n.code} title={n.text} className="grid grid-cols-[3.5rem_minmax(0,1fr)] items-baseline gap-3 border-b border-hairline py-[7px] text-[0.875rem]">
                <span className="text-end font-medium text-ink tabular-nums">{n.count.toLocaleString('en-GB')}</span>
                <span className="text-ink">{FACT[n.code] ?? n.text}</span>
              </li>
            ))}
          </ul>
        </PaneSection>
      )}
    </DeskPane>
  )
}

/** What a run did to the registry, as one short sentence. */
function changeSentence(change: RunChange) {
  switch (change.kind) {
    case 'stored': {
      const s = change.startups
      if (change.download === 1 || (s && s.changed === 0 && s.unchanged === 0)) return 'First download: everything is new.'
      const parts = [
        `${plural(change.entriesNew, 'new entry', 'new entries')}`,
        ...(change.entriesWithdrawn ? [`${change.entriesWithdrawn} no longer published`] : []),
        ...(s ? [`startups ${s.created} new, ${s.changed} changed, ${s.unchanged} unchanged`] : []),
      ]
      return `${parts.join(' · ')}.`
    }
    case 'confirmed':
      return `Same rows as the download of ${change.sameAs ? dateOnly(change.sameAs) : 'the run before'}; nothing new to store.`
    case 'legacy':
      return 'Made by the pipeline before v2; what it stored was replaced.'
    default:
      return 'Nothing to compare.'
  }
}
