import { Link } from '@tanstack/react-router'
import { CircleCheck, CircleDashed, Clock } from 'lucide-react'

import { Evidence, PaneSection } from '@/components/athar/desk'
import { day } from '@/components/athar/trace-parts'
import type { EntryView } from '#/server/pipeline/state'

/*
 * The sections an operator reads to answer "why does Athar say this about this startup?", shared by the Startups page
 * (and anything else that shows one entry): how an entry was read, what Athar observed and computed, namesakes.
 */

export type StateKind = 'current' | 'stale' | 'none'

/** An observation or a computed value is current, out of date, or absent: the same icon-plus-word as Status. */
export function StateWord({ state }: { state: StateKind }) {
  const { Icon, word } = state === 'current' ? { Icon: CircleCheck, word: 'Up to date' } : state === 'stale' ? { Icon: Clock, word: 'Stale' } : { Icon: CircleDashed, word: 'None' }
  return (
    <span className="inline-flex items-center gap-1.5 text-[0.875rem] text-ink">
      <Icon className="size-4 shrink-0" aria-hidden />
      {word}
    </span>
  )
}

function Line({ label, state, children }: { label: string; state: StateKind; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[150px_120px_minmax(0,1fr)] items-baseline gap-x-3 border-b border-hairline py-[7px]">
      <span className="text-[0.8125rem] text-ink-2">{label}</span>
      <StateWord state={state} />
      <span className="text-[0.875rem] [overflow-wrap:anywhere] text-ink">{children}</span>
    </div>
  )
}

/** What reading changed in one entry, as Field / Published / Read as / Why, then its notes; or "Read as published." */
export function HowRead({ v }: { v: Pick<EntryView, 'changes' | 'notes'> }) {
  return (
    <>
      {v.changes.length === 0 ? (
        <p className="text-[0.875rem] text-ink">Read as published.</p>
      ) : (
        <Evidence headers={['Field', 'Published', 'Read as', 'Why']} rows={v.changes.map((c) => ({ field: c.field, wrote: c.from, cleaning: c.to ?? 'Left empty', why: c.why }))} />
      )}
      {v.notes.length > 0 && (
        <ul className="mt-2.5 grid gap-1">
          {v.notes.map((n) => (
            <li key={n.code} className="text-[0.875rem] text-ink">
              {n.text}
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

/** The fields two entries of one startup read differently: this one against the entry the values come from. */
export function Differences({ rows, against = 'The values' }: { rows: { field: string; here: string | null; there: string | null }[]; against?: string }) {
  if (rows.length === 0) return <p className="text-[0.875rem] text-ink">Says the same as the entry the values come from.</p>
  return (
    <dl className="grid grid-cols-[150px_minmax(0,1fr)_minmax(0,1fr)] gap-x-3 gap-y-1 text-[0.875rem]">
      <dt className="text-[0.8125rem] text-ink-2">Differs on</dt>
      <dd className="text-[0.8125rem] text-ink-2">{against}</dd>
      <dd className="text-[0.8125rem] text-ink-2">This entry</dd>
      {rows.map((x) => (
        <div key={x.field} className="contents">
          <dt className="text-ink">{x.field}</dt>
          <dd className="[overflow-wrap:anywhere] text-ink">{x.here ?? <span className="text-ink-3">empty</span>}</dd>
          <dd className="[overflow-wrap:anywhere] text-ink">{x.there ?? <span className="text-ink-3">empty</span>}</dd>
        </div>
      ))}
    </dl>
  )
}

/** Startups with the same name that were kept apart, each with the reason. */
export function Namesakes({ items }: { items: EntryView['namesakes'] }) {
  if (items.length === 0) return null
  return (
    <div className="mt-4">
      <h4 className="mb-1.5 font-sans text-[0.8125rem] font-medium text-ink-2">Same name, different company</h4>
      <ul className="border-t border-edge">
        {items.map((n) => (
          <li key={n.id} className="border-b border-hairline py-2 text-[0.875rem] text-ink">
            <Link to="/portal/startups" search={{ startup: n.id }} className="text-glaze underline">
              {n.name}
            </Link>
            : {n.why}
          </li>
        ))}
      </ul>
    </div>
  )
}

/** The later steps for one startup: the website check, the prepared text and the vector, each with its state. */
export function Observed({ d }: { d: NonNullable<EntryView['downstream']> }) {
  return (
    <PaneSection title="What Athar observed and computed">
      <div className="border-t border-edge">
        <Line label="Website check" state={d.check ? 'current' : 'none'}>
          {d.check
            ? `${d.check.status === 'reachable' ? 'Answers' : `Does not answer since ${day(d.check.since)}`} (${d.check.detail})${d.check.finalHost ? `, now from ${d.check.finalHost}` : ''} · asked ${day(d.check.checkedAt)}`
            : 'Not asked: no website of its own, or not checked yet'}
        </Line>
        <Line label="Prepared text" state={d.prepared ? (d.prepared.current ? 'current' : 'stale') : 'none'}>
          {d.prepared ? `${d.prepared.model ?? 'model unknown'} · ${day(d.prepared.at)}` : 'Not prepared'}
        </Line>
        <Line label="Vector" state={d.vector ? (d.vector.current ? 'current' : 'stale') : 'none'}>
          {d.vector ? `${d.vector.model} (${d.vector.revision}) · from the ${d.vector.from} · ${day(d.vector.at)}` : 'Not embedded'}
        </Line>
      </div>
    </PaneSection>
  )
}
