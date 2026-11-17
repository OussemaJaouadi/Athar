import { CircleAlert, CircleCheck, CircleDashed, CircleX, Clock, KeyRound, LoaderCircle, OctagonX } from 'lucide-react'

import { Status, StatusIndicator, StatusLabel } from '@/components/kibo-ui/status'
import { cn } from '@/lib/utils'

/*
 * State in the operator portal: an icon and a word on a tinted pill. The colour is in the icon and the tint; the word
 * stays ink, so the state reads at a glance and never by colour alone.
 */

export type Tone = 'ok' | 'warn' | 'bad' | 'busy' | 'idle'

const TONE: Record<Tone, { pill: string; icon: string }> = {
  ok: { pill: 'bg-ok-bg', icon: 'text-ok' },
  warn: { pill: 'bg-warn-bg', icon: 'text-warn' },
  bad: { pill: 'bg-bad-bg', icon: 'text-bad' },
  busy: { pill: 'bg-surface-raised', icon: 'text-glaze' },
  idle: { pill: 'bg-surface-raised', icon: 'text-ink-2' },
}

type State = { label: string; Icon: typeof Clock; tone: Tone; spin?: boolean }

export function StatePill({ state, className, bare }: { state: State; className?: string; bare?: boolean }) {
  const t = TONE[state.tone]
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-[0.8125rem] whitespace-nowrap text-ink', !bare && cn('h-6 rounded-full ps-1.5 pe-2.5', t.pill), className)}>
      <state.Icon className={cn('size-4 shrink-0', t.icon, state.spin && 'animate-spin motion-reduce:animate-none')} aria-hidden />
      {state.label}
    </span>
  )
}

const STATES: Record<string, State> = {
  running: { label: 'Running', Icon: LoaderCircle, tone: 'busy', spin: true },
  done: { label: 'Finished', Icon: CircleCheck, tone: 'ok' },
  failed: { label: 'Failed', Icon: CircleX, tone: 'bad' },
  interrupted: { label: 'Interrupted', Icon: OctagonX, tone: 'warn' },
  pending: { label: 'Waiting', Icon: Clock, tone: 'idle' },
  skipped: { label: 'Not run yet', Icon: CircleDashed, tone: 'idle' },
  'not run': { label: 'Not run yet', Icon: CircleDashed, tone: 'idle' },
}

/** A run's state. In a table the pill is dropped (`bare`) so rows stay quiet; the icon keeps its colour. */
export function RunStatus({ status, className, bare = true }: { status: string; className?: string; bare?: boolean }) {
  return <StatePill state={STATES[status] ?? STATES.pending} bare={bare} className={className} />
}

export const STEP_STATES: Record<string, State> = {
  up_to_date: { label: 'Up to date', Icon: CircleCheck, tone: 'ok' },
  stale: { label: 'Out of date', Icon: CircleAlert, tone: 'warn' },
  never_run: { label: 'Never run', Icon: CircleDashed, tone: 'idle' },
  running: { label: 'Running', Icon: LoaderCircle, tone: 'busy', spin: true },
  failed: { label: 'Failed', Icon: CircleX, tone: 'bad' },
  not_configured: { label: 'Needs an AI key', Icon: KeyRound, tone: 'idle' },
}

// Kibo's Status has four states; the two idle ones (never run, needs a key) have no live dot, so they stay a quiet pill.
const KIBO: Record<string, "online" | "offline" | "maintenance" | "degraded"> = { up_to_date: "online", failed: "offline", running: "maintenance", stale: "degraded" }

/** A pipeline step's state (getPipelineState): Kibo UI's Status badge, a live dot and a word. */
export function StepStateBadge({ state, className, bare }: { state: string; className?: string; bare?: boolean }) {
  const s = STEP_STATES[state] ?? STEP_STATES.never_run
  const kibo = KIBO[state]
  if (!kibo || bare) return <StatePill state={s} bare={bare} className={className} />
  return (
    <Status status={kibo} className={cn('shrink-0 font-normal', className)}>
      <StatusIndicator />
      <StatusLabel className="text-ink">{s.label}</StatusLabel>
    </Status>
  )
}
