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
    let lastSig = ''
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
        // Refresh the page when a step changes state or the run ends, not on every tick.
        const sig = next ? `${next.run.id}:${next.steps.map((st) => st.status).join(',')}` : ''
        if ((wasRunning && !running) || (running && sig !== lastSig)) router.invalidate()
        lastSig = sig
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
      {/* Pinned above the pane foot bar, out of the page flow so the desk never scrolls as a whole. */}
      <Toaster toaster={toaster} className="pointer-events-none fixed end-6 bottom-20 z-50 w-[380px] [&_li]:pointer-events-auto" />
    </ToasterContext.Provider>
  )
}

export const operationName = (value: string) =>
  ({
    collect: 'Collect',
    rebuild: 'Rebuild',
    check: 'Check websites',
    clean: 'Clean',
    merge: 'Merge',
    build: 'Build',
    prepare: 'Prepare',
    embed: 'Embed',
  })[value] ?? 'Operation'
export const labTime = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
