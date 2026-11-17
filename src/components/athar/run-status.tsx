import { CircleCheck, CircleDashed, CircleX, Clock, LoaderCircle, OctagonX } from 'lucide-react'

import { cn } from '@/lib/utils'

const STATES: Record<string, { label: string; Icon: typeof Clock; bar: string; spin?: boolean }> = {
  running: { label: 'Running', Icon: LoaderCircle, bar: 'border-s-glaze', spin: true },
  done: { label: 'Finished', Icon: CircleCheck, bar: 'border-s-glaze' },
  failed: { label: 'Failed', Icon: CircleX, bar: 'border-s-destructive' },
  interrupted: { label: 'Interrupted', Icon: OctagonX, bar: 'border-s-destructive' },
  pending: { label: 'Waiting', Icon: Clock, bar: 'border-s-edge' },
  skipped: { label: 'Not run yet', Icon: CircleDashed, bar: 'border-s-edge' },
  'not run': { label: 'Not run yet', Icon: CircleDashed, bar: 'border-s-edge' },
}

/** A run or step state: ink words, an icon per state, and a 2px edge bar. Never colour alone. */
export function RunStatus({ status, className }: { status: string; className?: string }) {
  const s = STATES[status] ?? STATES.pending
  return (
    <span className={cn('inline-flex h-6 items-center gap-1.5 rounded-sm border border-edge border-s-2 ps-1.5 pe-2 text-[0.8125rem] text-ink', s.bar, className)}>
      <s.Icon className={cn('size-3.5 shrink-0', s.spin && 'animate-spin motion-reduce:animate-none')} aria-hidden />
      {s.label}
    </span>
  )
}
