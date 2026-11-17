import { useRouter } from '@tanstack/react-router'
import { createContext, useContext, useEffect, useState } from 'react'

import {
  StatusIsland,
  type IslandTask,
} from '@/components/kokonutui/status-island'
import {
  Toaster,
  usePromiseToast,
  type PromiseToaster,
} from '@/components/kokonutui/promise-toast'
import { getActiveRun } from '#/server/api/portal'

const ToasterContext = createContext<PromiseToaster | null>(null)

export function useLabToaster() {
  const toaster = useContext(ToasterContext)
  if (!toaster)
    throw new Error('useLabToaster must be used inside <LabInstruments>')
  return toaster
}

type Active = Awaited<ReturnType<typeof getActiveRun>>

/** The lab's instruments: a status island for the run in flight and a toast rail for actions. */
export function LabInstruments({ children }: { children: React.ReactNode }) {
  const toaster = usePromiseToast()
  const router = useRouter()
  const [active, setActive] = useState<Active>(null)
  const [dismissed, setDismissed] = useState<string>()

  const [offline, setOffline] = useState(false)

  // The portal's one poller: fast while a run is going, slow otherwise, paused while the tab is hidden.
  // A finished run stays on the island until dismissed; a lost server says so instead of failing silently.
  useEffect(() => {
    let stop = false
    let wasRunning = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const tick = async () => {
      if (stop) return
      if (document.hidden) {
        timer = setTimeout(tick, 4000)
        return
      }
      try {
        const next = await getActiveRun()
        if (stop) return
        setOffline(false)
        setActive(next)
        const running = next?.run.status === 'running'
        // While a run is going every portal page follows it; one last refresh when it ends.
        if (running || wasRunning) router.invalidate()
        wasRunning = running
        timer = setTimeout(tick, running ? 1000 : 4000)
      } catch {
        if (stop) return
        setOffline(true)
        timer = setTimeout(tick, 8000)
      }
    }
    const wake = () => {
      if (!document.hidden) {
        clearTimeout(timer)
        tick()
      }
    }
    document.addEventListener('visibilitychange', wake)
    tick()
    return () => {
      stop = true
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', wake)
    }
  }, [router])

  const tasks: IslandTask[] = []
  if (offline) tasks.push({ id: 'offline', label: "Can't reach the server", detail: 'Trying again every few seconds.', status: 'error' })
  if (
    active &&
    active.run.id !== dismissed &&
    (active.run.status === 'running' ||
      Date.now() - Date.parse(active.run.finished_at ?? '') < 60_000)
  ) {
    const done = active.steps.filter(
      (s) => s.status === 'done' || s.status === 'skipped',
    ).length
    const current = active.steps.find((s) => s.status === 'running')
    const failed =
      active.run.status === 'failed' || active.run.status === 'interrupted'
    tasks.push({
      id: active.run.id,
      label: failed
        ? `${operationName(active.run.operation)} stopped`
        : active.run.status === 'running'
          ? `${operationName(active.run.operation)}: ${current ? operationName(current.step) : 'starting'}`
          : `${operationName(active.run.operation)} finished`,
      detail: failed
        ? 'Open the run to see what failed.'
        : `${done} of ${active.steps.length} steps`,
      status: failed
        ? 'error'
        : active.run.status === 'running'
          ? 'running'
          : 'done',
      progress:
        active.run.status === 'running'
          ? done / Math.max(1, active.steps.length)
          : undefined,
      action: {
        label: 'Open',
        onClick: () =>
          router.navigate({
            to: '/portal/runs/$runId',
            params: { runId: active.run.id },
          }),
      },
    })
  }

  return (
    <ToasterContext.Provider value={toaster}>
      {children}
      {tasks.length > 0 && (
        <div className="pointer-events-none fixed inset-x-0 top-16 z-40 flex justify-center">
          <div className="pointer-events-auto">
            <StatusIsland tasks={tasks} onDismiss={(id) => setDismissed(id)} />
          </div>
        </div>
      )}
      <Toaster toaster={toaster} />
    </ToasterContext.Provider>
  )
}

export const operationName = (value: string) =>
  ({
    collect: 'Collect',
    clean: 'Clean',
    merge: 'Merge',
    prepare: 'Prepare',
    embed: 'Embed',
  })[value] ?? 'Operation'
export const statusName = (value: string) =>
  ({
    done: 'Finished',
    running: 'Running',
    failed: 'Failed',
    interrupted: 'Interrupted',
    pending: 'Waiting',
    skipped: 'Not run yet',
    'not run': 'Not run yet',
  })[value] ?? 'Not run yet'
export const findingName = (value: string) =>
  ({
    missing_description: 'No description in the registry',
    website_unrepairable: 'Website could not be repaired',
    industry_differs: 'Industry differs from sector',
    cohort_unreadable: 'Label date could not be read',
    cohort_before_creation: 'Label date is before the creation year',
    possible_duplicate: 'Startups may be duplicates',
  })[value] ?? 'Finding needs review'
export const findingSentence = (value: string) =>
  ({
    missing_description:
      'The description stays missing until a source fills it.',
    website_unrepairable:
      'The website stays out of the condition checks until a usable address is supplied.',
    industry_differs: 'Check which sector best describes the startup.',
    cohort_unreadable: 'Check the label date against the registry.',
    cohort_before_creation:
      'Check the label date and creation year against their sources.',
    possible_duplicate:
      'Check whether these source rows describe the same startup.',
  })[value] ?? 'Check the source row before resolving this finding.'
export const labControl =
  'h-10 rounded-[4px] border border-control border-input bg-canvas px-3 text-sm text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-glaze disabled:cursor-not-allowed'
export const labPrimary =
  'h-10 rounded-[4px] bg-glaze px-4 text-sm font-medium text-glaze-ink text-primary-foreground hover:bg-[var(--glaze-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-glaze disabled:cursor-not-allowed disabled:bg-surface-raised disabled:text-ink-2'
export const labTime = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
export const labDuration = (start: string | null, end: string | null) =>
  start && end
    ? Date.parse(end) - Date.parse(start) < 100
      ? 'under 0.1 s'
      : `${((Date.parse(end) - Date.parse(start)) / 1000).toFixed(1)} s`
    : null

export function StageStrip({
  collected,
  cleaned,
  merged,
  inReview,
  openFindings,
  notes = [],
}: {
  collected: number
  cleaned: number
  merged: number
  inReview: number
  openFindings?: number
  notes?: string[]
}) {
  const cells = [
    {
      label: 'Collect',
      value: collected,
      unit: 'source rows',
      note: 'As downloaded',
    },
    {
      label: 'Clean',
      value: cleaned,
      unit: 'records',
      note: 'Original values kept',
    },
    {
      label: 'Merge',
      value: merged,
      unit: 'startups',
      note: 'Matched from source rows',
    },
    { label: 'Prepare', value: null, unit: '', note: 'Not built yet' },
    {
      label: 'In review',
      value: inReview,
      unit: 'records',
      note: openFindings !== undefined ? `${openFindings} open ${openFindings === 1 ? 'finding' : 'findings'}` : 'With open findings',
    },
  ]
  const n = (v: number) => v.toLocaleString('en-GB')
  return (
    <>
    <p className="border border-edge bg-surface px-3.5 py-2.5 text-sm sm:hidden">
      {n(collected)} rows → {n(cleaned)} records → {n(merged)} startups · Prepare not run · {n(inReview)} in review
    </p>
    <section
      aria-label="Registry stages"
      className="hidden border border-edge bg-surface sm:grid sm:grid-cols-5"
    >
      {cells.map((cell, i) => (
        <div
          key={cell.label}
          className="grid content-start gap-1 border-b border-hairline px-3.5 py-3 last:border-0 sm:border-e sm:border-b-0"
        >
          <span className="text-sm text-ink-2">{cell.label}</span>
          <span className="tabular-nums font-medium">
            {cell.value === null
              ? 'Not run yet'
              : cell.value.toLocaleString('en-GB')}{' '}
            <span className="font-normal">{cell.unit}</span>
          </span>
          <span className="flex items-start gap-1.5 text-sm text-ink">
            <span
              aria-hidden
              className="mt-1.5 size-1.5 shrink-0 rounded-full bg-ochre"
            />
            {notes[i] ?? cell.note}
          </span>
        </div>
      ))}
    </section>
    </>
  )
}
