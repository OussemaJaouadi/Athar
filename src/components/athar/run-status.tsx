import { CircleAlert, CircleCheck, CircleDashed, CircleX, Clock, KeyRound, LoaderCircle, OctagonX } from 'lucide-react'

import { cn } from '@/lib/utils'

const STATES: Record<string, { label: string; Icon: typeof Clock; spin?: boolean }> = {
  running: { label: 'Running', Icon: LoaderCircle, spin: true },
  done: { label: 'Finished', Icon: CircleCheck },
  failed: { label: 'Failed', Icon: CircleX },
  interrupted: { label: 'Interrupted', Icon: OctagonX },
  pending: { label: 'Waiting', Icon: Clock },
  skipped: { label: 'Not run yet', Icon: CircleDashed },
  'not run': { label: 'Not run yet', Icon: CircleDashed },
}

/** A run or step state: an icon per state and ink words, 13px. Never colour alone. */
export function RunStatus({ status, className }: { status: string; className?: string }) {
  const s = STATES[status] ?? STATES.pending
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-[0.8125rem] whitespace-nowrap text-ink', className)}>
      <s.Icon className={cn('size-3.5 shrink-0', s.spin && 'animate-spin motion-reduce:animate-none')} aria-hidden />
      {s.label}
    </span>
  )
}

const STEP_STATES: Record<string, { label: string; Icon: typeof Clock; spin?: boolean }> = {
  up_to_date: { label: 'Up to date', Icon: CircleCheck },
  stale: { label: 'Stale', Icon: CircleAlert },
  never_run: { label: 'Never run', Icon: CircleDashed },
  running: { label: 'Running', Icon: LoaderCircle, spin: true },
  failed: { label: 'Failed', Icon: CircleX },
  not_configured: { label: 'Not configured', Icon: KeyRound },
}

/** A pipeline step's state (getPipelineState): icon plus word, 13px ink. Never colour alone. */
export function StepStateBadge({ state, className }: { state: string; className?: string }) {
  const s = STEP_STATES[state] ?? STEP_STATES.never_run
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-[0.8125rem] whitespace-nowrap text-ink', className)}>
      <s.Icon className={cn('size-3.5 shrink-0', s.spin && 'animate-spin motion-reduce:animate-none')} aria-hidden />
      {s.label}
    </span>
  )
}
