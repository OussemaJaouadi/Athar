import { useNavigate } from '@tanstack/react-router'
import { LoaderCircle, Play } from 'lucide-react'
import { useState } from 'react'

import { deskBtn, deskPrimary } from '@/components/athar/desk'
import { useLabToaster } from '@/components/athar/lab'
import { cn } from '@/lib/utils'
import { startOperation } from '#/server/api/portal'

/**
 * Start one pipeline operation (collect, rebuild, check, prepare, embed), then select its step and run so the operator
 * can follow it. `primary` is the page bar's recommended next step; the step panes use the quiet button.
 */
export function RunStepButton({
  operation,
  label,
  disabled,
  primary,
  children,
  className,
}: {
  operation: string
  label: string
  disabled?: boolean
  primary?: boolean
  children?: React.ReactNode
  className?: string
}) {
  const navigate = useNavigate()
  const toaster = useLabToaster()
  const [starting, setStarting] = useState(false)
  return (
    <button
      type="button"
      className={cn(primary ? deskPrimary : deskBtn, className)}
      disabled={disabled || starting}
      onClick={() => {
        setStarting(true)
        toaster.show(
          async () => {
            try {
              const { runId } = await startOperation({ data: operation })
              await navigate({ to: '/portal', search: { step: operation, run: runId } })
            } finally {
              setStarting(false)
            }
          },
          {
            loading: `Starting ${label}`,
            success: [`${label} started`, 'Its step is selected; the counts update as it runs.'],
            error: (error) => [`${label} could not start: ${error instanceof Error ? error.message.replace(/[.\s]+$/, '') : String(error)}.`, 'Nothing was changed.'],
          },
        )
      }}
    >
      {starting ? <LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden /> : <Play aria-hidden />}
      {children ?? `Run ${label}`}
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
