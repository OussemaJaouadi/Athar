import { useRouter } from '@tanstack/react-router'
import { createContext, useContext, useEffect, useState } from 'react'

import { StatusIsland, type IslandTask } from '@/components/kokonutui/status-island'
import { Toaster, usePromiseToast, type PromiseToaster } from '@/components/kokonutui/promise-toast'
import { getActiveRun } from '#/server/api/portal'

const ToasterContext = createContext<PromiseToaster | null>(null)

export function useLabToaster() {
  const toaster = useContext(ToasterContext)
  if (!toaster) throw new Error('useLabToaster must be used inside <LabInstruments>')
  return toaster
}

type Active = Awaited<ReturnType<typeof getActiveRun>>

/** The lab's instruments: a status island for the run in flight and a toast rail for actions. */
export function LabInstruments({ children }: { children: React.ReactNode }) {
  const toaster = usePromiseToast()
  const router = useRouter()
  const [active, setActive] = useState<Active>(null)
  const [dismissed, setDismissed] = useState<string>()

  // Poll while a run is going; a finished run stays on the island until dismissed.
  useEffect(() => {
    let stop = false
    let wasRunning = false
    const tick = async () => {
      const next = await getActiveRun().catch(() => null)
      if (stop) return
      setActive(next)
      const running = next?.run.status === 'running'
      if (wasRunning && !running) router.invalidate()
      wasRunning = running
      setTimeout(tick, running ? 1000 : 4000)
    }
    tick()
    return () => {
      stop = true
    }
  }, [router])

  const tasks: IslandTask[] = []
  if (active && active.run.id !== dismissed && (active.run.status === 'running' || Date.now() - Date.parse(active.run.finished_at ?? '') < 60_000)) {
    const done = active.steps.filter((s) => s.status === 'done' || s.status === 'skipped').length
    const current = active.steps.find((s) => s.status === 'running')
    const failed = active.run.status === 'failed' || active.run.status === 'interrupted'
    tasks.push({
      id: active.run.id,
      label: failed ? `${active.run.operation} stopped` : active.run.status === 'running' ? `${active.run.operation}: ${current?.step ?? 'starting'}` : `${active.run.operation} finished`,
      detail: failed ? (active.run.error ?? undefined) : `${done} of ${active.steps.length} steps`,
      status: failed ? 'error' : active.run.status === 'running' ? 'running' : 'done',
      progress: active.run.status === 'running' ? done / Math.max(1, active.steps.length) : undefined,
      action: { label: 'Open', onClick: () => router.navigate({ to: '/portal/runs/$runId', params: { runId: active.run.id } }) },
    })
  }

  return (
    <ToasterContext.Provider value={toaster}>
      {children}
      {tasks.length > 0 && (
        <div className="pointer-events-none fixed inset-x-0 top-3 z-40 flex justify-center">
          <div className="pointer-events-auto">
            <StatusIsland tasks={tasks} onDismiss={(id) => setDismissed(id)} />
          </div>
        </div>
      )}
      <Toaster toaster={toaster} />
    </ToasterContext.Provider>
  )
}
