import { Link } from '@tanstack/react-router'

import { PaneSection } from '@/components/athar/desk'
import type { getReviewSummary } from '#/server/api/review'

type Summary = Awaited<ReturnType<typeof getReviewSummary>>

const n = (v: number) => v.toLocaleString('en-GB')

/** Readings by who settled them: a rule, an inference shown with a qualifier, or you. One sentence, one bar, three figures. */
export function LaneTotals({ summary }: { summary: Summary }) {
  const { totals, toAnswer, waitingOnPerson } = summary
  const total = totals.rule + totals.inferred + totals.review
  const waiting = totals.open
  const inferred = totals.inferredOpen
  const settled = Math.max(0, total - waiting - inferred)

  if (total === 0)
    return (
      <PaneSection title="Readings">
        <p className="text-[0.875rem] text-ink">No readings yet. Run everything to build them.</p>
      </PaneSection>
    )

  const parts = [
    { key: 'rule', label: 'Settled by a rule', count: settled, color: 'bg-edge' },
    { key: 'inferred', label: 'Inferred, with a qualifier', count: inferred, color: 'bg-ochre' },
    { key: 'waiting', label: 'Waiting for you', count: waiting, color: 'bg-warn' },
  ]
  const answered = totals.decided

  return (
    <PaneSection title="Readings">
      <p className="text-[0.875rem] text-ink">
        {`Of ${n(total)} readings, ${n(settled)} ${answered > 0 ? 'are settled, by a rule or by you' : 'were settled by a rule'}, ${n(inferred)} ${inferred === 1 ? 'is' : 'are'} inferred and shown with a qualifier, and ${n(waiting)} ${waiting === 1 ? 'waits' : 'wait'} for you.`}
        {answered > 0 && ` You answered ${n(answered)}.`}
        {toAnswer !== waiting && ` ${n(toAnswer)} ${toAnswer === 1 ? 'is' : 'are'} asked now; ${n(waitingOnPerson)} depend${waitingOnPerson === 1 ? 's' : ''} on your answers about people.`}
      </p>
      <div
        role="img"
        aria-label={`${n(settled)} settled by a rule, ${n(inferred)} inferred, ${n(waiting)} waiting for you, of ${n(total)} readings`}
        className="mt-3 flex h-2.5 w-full gap-0.5"
      >
        {parts.map((p) =>
          p.count > 0 ? <span key={p.key} data-lane={p.key} className={p.color} style={{ flex: `${p.count} 0 0%` }} /> : null,
        )}
      </div>
      <ul className="mt-2.5 grid gap-1 text-[0.875rem] tabular-nums">
        {parts.map((p) => (
          <li key={p.key} data-lane-label={p.key} className="flex items-baseline gap-2">
            <span aria-hidden className={`size-2.5 shrink-0 self-center ${p.color}`} />
            <span className="font-medium text-ink">{n(p.count)}</span>
            <span className="text-ink-2">{p.label}</span>
          </li>
        ))}
      </ul>
      {waiting > 0 && (
        <Link to="/portal/review" className="mt-3 inline-block text-[0.875rem] font-medium text-ink underline underline-offset-4">
          Open the review
        </Link>
      )}
    </PaneSection>
  )
}
