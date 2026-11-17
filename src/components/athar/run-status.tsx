import { CircleCheck, CircleDashed, CircleX, Clock, LoaderCircle, OctagonX } from 'lucide-react'

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
