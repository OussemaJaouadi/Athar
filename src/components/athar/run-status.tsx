import { cn } from '@/lib/utils'

const TONE: Record<string, string> = {
  running: 'border-ink text-ink',
  done: 'border-hairline text-ink',
  skipped: 'border-dashed border-zinc-400 text-ink-2',
  failed: 'border-destructive text-destructive',
  interrupted: 'border-destructive text-destructive',
  pending: 'border-hairline text-ink-2',
  'not run': 'border-dashed border-zinc-400 text-ink-2',
}

/** A run or step state as a small tag; colour only carries hue for failures. */
export function RunStatus({ status }: { status: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-sm border px-1.5 font-mono text-[0.6875rem] leading-5', TONE[status] ?? TONE.pending)}>
      {status === 'running' && <span className="size-1.5 animate-pulse rounded-full bg-ink" aria-hidden />}
      {status}
    </span>
  )
}
