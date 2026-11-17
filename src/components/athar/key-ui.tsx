import { CircleAlert, CircleCheck, Trash2 } from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import { useId } from 'react'

import { useHoldToConfirm } from '@/components/interior/hold-to-confirm'
import { cn } from '@/lib/utils'

export const keyControl =
  'h-10 w-full rounded-md border border-edge bg-canvas px-3 text-[0.9375rem] text-ink placeholder:text-ink-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-glaze disabled:cursor-not-allowed'
export const keyPrimary =
  'inline-flex h-10 items-center justify-center gap-2 rounded-md bg-glaze px-4 text-[0.9375rem] font-medium text-glaze-ink hover:bg-[var(--glaze-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-glaze disabled:cursor-not-allowed disabled:border disabled:border-edge disabled:bg-surface disabled:text-ink-2'
export const keySecondary =
  'inline-flex h-10 items-center justify-center gap-2 rounded-md border border-edge bg-canvas px-4 text-[0.9375rem] font-medium text-ink hover:border-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-glaze disabled:cursor-not-allowed disabled:text-ink-2'

/** A test or save result in ink, with an icon and an edge bar: never colour alone. */
export function KeyNote({ ok, children, className }: { ok: boolean; children: React.ReactNode; className?: string }) {
  const Icon = ok ? CircleCheck : CircleAlert
  return (
    <div
      role={ok ? 'status' : 'alert'}
      className={cn('flex items-start gap-2 border-s-2 ps-3 text-[0.875rem] leading-6 text-ink', ok ? 'border-s-glaze' : 'border-s-destructive', className)}
    >
      <Icon className="mt-1 size-4 shrink-0" aria-hidden />
      <div className="min-w-0">{children}</div>
    </div>
  )
}

/** Remove, held to confirm (Interior's hold hook, drawn in Athar's tokens). */
export function HoldToRemove({ label, onConfirm }: { label: string; onConfirm: () => void }) {
  const { bind, phase, progress } = useHoldToConfirm({ onConfirm, duration: 1200 })
  const reduced = useReducedMotion()
  const hint = useId()
  const committed = phase === 'committed'
  return (
    <button
      type="button"
      {...bind}
      aria-describedby={hint}
      aria-disabled={committed}
      aria-label={`Hold to remove ${label}`}
      style={{ touchAction: 'manipulation' }}
      className="relative isolate inline-flex h-9 select-none items-center gap-2 overflow-hidden rounded-md border border-edge bg-canvas px-3 text-[0.875rem] font-medium text-ink hover:border-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-glaze"
    >
      <motion.span
        aria-hidden
        className="absolute inset-y-0 start-0 -z-10 bg-surface-raised"
        initial={false}
        animate={{ width: `${(committed ? 1 : progress) * 100}%` }}
        transition={reduced ? { duration: 0 } : { duration: 0.06, ease: 'linear' }}
      />
      <Trash2 className="size-4" aria-hidden />
      {committed ? 'Removing…' : 'Hold to remove'}
      <span id={hint} className="sr-only">
        Press and hold to remove the key. Releasing early cancels.
      </span>
    </button>
  )
}
