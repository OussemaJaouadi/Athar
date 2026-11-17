import { useNavigate } from '@tanstack/react-router'
import { LoaderCircle, RefreshCw } from 'lucide-react'
import { useState } from 'react'

import { useLabToaster } from '@/components/athar/lab'
import { deskPrimary } from '@/components/athar/desk'
import { cn } from '@/lib/utils'
import { startOperation } from '#/server/api/portal'

/** The pipeline's one action. Starts Collect, then opens the run so the operator can follow it. */
export function CollectButton({ running, again, className }: { running: boolean; again: boolean; className?: string }) {
  const navigate = useNavigate()
  const toaster = useLabToaster()
  const [starting, setStarting] = useState(false)
  const busy = starting || running
  return (
    <button
      type="button"
      className={cn(deskPrimary, className)}
      disabled={busy}
      onClick={() => {
        setStarting(true)
        toaster.show(
          async () => {
            try {
              const { runId } = await startOperation({ data: 'collect' })
              await navigate({ to: '/portal', search: { run: runId } })
            } finally {
              setStarting(false)
            }
          },
          {
            loading: 'Starting Collect',
            success: ['Collect started', 'It is selected in the list; its steps update as they run.'],
            error: (error) => [
              `Collect could not start: ${error instanceof Error ? error.message.replace(/[.\s]+$/, '') : String(error)}.`,
              'The stored registry is unchanged.',
            ],
          },
        )
      }}
    >
      {busy ? (
        <LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden />
      ) : (
        <RefreshCw aria-hidden />
      )}
      {busy ? 'Collecting…' : again ? 'Collect again' : 'Collect the registry'}
    </button>
  )
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString('en-GB')} ${n === 1 ? one : many}`

export const shortId = (id: string) => id.slice(-4)

export function duration(start: string | null, end: string | null) {
  if (!start || !end) return null
  const ms = Date.parse(end) - Date.parse(start)
  if (ms < 1000) return `${Math.max(0.1, ms / 1000).toFixed(1)} s`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`
  return `${Math.floor(ms / 60_000)} min ${Math.round((ms % 60_000) / 1000)} s`
}
