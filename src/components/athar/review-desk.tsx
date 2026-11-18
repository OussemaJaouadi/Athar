import { Link, useNavigate } from '@tanstack/react-router'
import { CircleAlert, Undo2 } from 'lucide-react'

import { DeskPane, Fields, Kbd, PaneSection, deskBtn, deskInput, type DeskField } from '@/components/athar/desk'
import { TileMark } from '@/components/athar/tile-mark'
import { day, month, plural } from '@/components/athar/trace-parts'
import { MarkerText, Mark } from '@/components/kokonutui/marker-text'
import { SegmentedControl } from '@/components/interior/segmented-control'
import { Alert, AlertDescription, AlertTitle } from '@/components/reui/alert'
import type { Json } from '#/server/api/review'
import type { ReviewItem } from '#/server/pipeline/review'
import type { PersonCard, StartupCard } from '#/server/pipeline/review-context'

/** The same switch in the bar of both desks: the startups, or the questions about how Athar read them. */
export function DeskSwitch({ current, open }: { current: 'startups' | 'review'; open: number }) {
  const navigate = useNavigate()
  return (
    <SegmentedControl
      label="Startups or review"
      value={current}
      options={[
        { value: 'startups', label: 'Startups' },
        { value: 'review', label: open > 0 ? `Review ${open.toLocaleString('en-GB')}` : 'Review' },
      ]}
      onValueChange={(v) => navigate({ to: v === 'review' ? '/portal/review' : '/portal/startups' })}
      className="shrink-0"
    />
  )
}

/** Group names in the list, in the words of the question each kind asks. */
export const KIND_NAME: Record<string, string> = {
  person: 'Same person on several startups',
  person_pair: 'Two names, maybe one person',
  relation: 'Related startups',
  website: 'Websites',
  founder: 'Founder names',
  alias: 'Other names for a startup',
  name: 'Startup names',
}

/** The words of a decision: the label the server gave its answer, or "Answered" when none is known. */
export const answerWords = (decided: { value: unknown; label?: string | null } | null | undefined): string => decided?.label ?? 'Answered'

const titleCase = (s: string) => s.replace(/(^|[\s'’-])(\p{L})/gu, (_, a: string, b: string) => a + b.toUpperCase())

/** What a list row calls a reading, from its subject alone: people by name, startups by slug. */
export function subjectWords(item: Pick<ReviewItem, 'kind' | 'subject' | 'label'>): string {
  if (item.label) return item.label
  const { kind, subject } = item
  if (kind === 'person') return titleCase(subject)
  if (kind === 'person_pair' || kind === 'relation') {
    const [a = '', b = ''] = subject.split('|')
    return kind === 'person_pair' ? `${titleCase(a)} · ${titleCase(b)}` : `${a} · ${b}`
  }
  if (kind === 'founder') return subject.slice(0, subject.lastIndexOf('#') < 0 ? undefined : subject.lastIndexOf('#'))
  return subject
}

const WEBSITE_STATE: Record<string, string> = {
  answers: 'answers',
  moved: 'moved to another address',
  parked: 'parked or gone',
  elsewhere: 'shows another site',
  silent: 'did not answer',
  unrelated: 'shows an unrelated site',
  reachable: 'answers',
  unreachable: 'did not answer',
}

const ext = { target: '_blank', rel: 'noreferrer noopener' } as const
const host = (url: string) => {
  try {
    return new URL(url).host.replace(/^www\./, '')
  } catch {
    return url
  }
}

function Card({ card, marked }: { card: StartupCard; marked: Set<string> }) {
  const fields: DeskField[] = [
    { label: 'Sector', value: card.sector },
    { label: 'Founded', value: card.creationYear },
    { label: 'Labelled', value: month(card.labelled) },
    {
      label: 'Website',
      value: card.website ? (
        <span className="grid gap-0.5">
          <a href={card.website} {...ext} className="font-mono text-[0.8125rem] text-glaze underline">
            {host(card.website)}
          </a>
          <span className="text-[0.8125rem] text-ink-2">{card.websiteState ? (WEBSITE_STATE[card.websiteState] ?? card.websiteState) : 'not checked'}</span>
        </span>
      ) : null,
    },
    { label: 'Description', value: card.description ? <span dir="auto">{card.description}</span> : null },
    {
      label: card.founders.length === 1 ? 'Founder' : 'Founders',
      value:
        card.founders.length > 0 ? (
          <MarkerText as="ul" show className="grid gap-0.5">
            {card.founders.map((f, i) => (
              <li key={`${f.key}-${i}`} dir="auto">
                {marked.has(f.key) ? <Mark type="highlight" color="var(--ochre)">{f.name}</Mark> : f.name}
              </li>
            ))}
          </MarkerText>
        ) : null,
    },
  ]
  return (
    <article aria-label={card.name} className="min-w-0 border border-edge bg-canvas">
      <header className="flex items-center gap-3 border-b border-hairline px-4 py-3">
        {card.sector && <TileMark id={card.id} sector={card.sector} size={28} className="shrink-0" title={card.sector} />}
        <div className="min-w-0">
          <h4 className="font-sans text-[0.9375rem] leading-snug font-medium text-ink">
            <Link to="/portal/startups" search={{ startup: card.id }} className="text-glaze underline" dir="auto">
              {card.name}
            </Link>
          </h4>
          {card.published !== card.name && <p className="text-[0.8125rem] text-ink-2" dir="auto">Published as {card.published}</p>}
        </div>
      </header>
      <Fields fields={fields} className="px-4 [&>div:last-child>*]:border-b-0" />
    </article>
  )
}

function People({ people }: { people: PersonCard[] }) {
  return (
    <ul className="grid gap-1.5">
      {people.map((p) => (
        <li key={p.key} className="text-[0.875rem] text-ink">
          <span className="text-ink-2">Published as </span>
          {p.names.map((n, i) => (
            <span key={n} dir="auto">
              {i > 0 && ', '}
              {n}
            </span>
          ))}
          <span className="text-ink-2"> · {plural(p.startups.length, 'startup')}</span>
        </li>
      ))}
    </ul>
  )
}

export type PaneContext = {
  id: string
  kind: string
  question: string
  answers: { label: string; value: Json }[]
  startups: StartupCard[]
  people: PersonCard[]
  sharedKeys: string[]
}

/** The question, the evidence beside it, and at the foot the answers. */
export function ReviewPane({
  ctx,
  item,
  position,
  busy,
  error,
  note,
  onNote,
  onAnswer,
  onUndo,
}: {
  ctx: PaneContext
  item?: ReviewItem
  position?: string
  busy: boolean
  error: string | null
  note: string
  onNote: (v: string) => void
  onAnswer: (value: Json) => void
  onUndo: () => void
}) {
  const marked = new Set([...ctx.sharedKeys, ...ctx.people.map((p) => p.key)])
  const read = item && ctx.kind === 'website' && item.value && typeof item.value === 'object' ? (item.value as Record<string, Json>) : null
  const text = (v: Json | undefined) => (typeof v === 'string' && v ? v : null)
  const link = (v: string | null) =>
    v ? (
      <a href={v} {...ext} className="font-mono text-[0.8125rem] text-glaze underline">
        {v}
      </a>
    ) : null
  const decided = item?.decided

  return (
    <DeskPane
      title={<span dir="auto">{ctx.question}</span>}
      statement={item?.why}
      position={position}
      foot={
        decided ? (
          <>
            <p className="min-w-0 flex-1 text-[0.875rem] text-ink">
              <span className="font-medium">{answerWords(decided)}</span>
              <span className="text-ink-2"> · answered {day(decided.decidedAt)}</span>
              {decided.note && <span dir="auto"> · {decided.note}</span>}
            </p>
            <button type="button" className={deskBtn} disabled={busy} onClick={onUndo}>
              <Undo2 aria-hidden />
              Undo
              <Kbd>U</Kbd>
            </button>
          </>
        ) : (
          <>
            <div className="flex flex-wrap gap-2.5" role="group" aria-label="Answers">
              {ctx.answers.map((a, i) => (
                <button key={a.label} type="button" className={deskBtn} disabled={busy} onClick={() => onAnswer(a.value)}>
                  <Kbd>{i + 1}</Kbd>
                  {a.label}
                </button>
              ))}
            </div>
            <label className="ms-auto min-w-[14rem] flex-1 sm:max-w-sm">
              <span className="sr-only">Note with your answer</span>
              <input value={note} onChange={(e) => onNote(e.target.value)} placeholder="Why, if it is not obvious" maxLength={300} className={`${deskInput} w-full`} />
            </label>
          </>
        )
      }
    >
      {error && (
        <Alert variant="destructive">
          <CircleAlert aria-hidden />
          <AlertTitle>Operation failed</AlertTitle>
          <AlertDescription>{error}. Try again; nothing was saved.</AlertDescription>
        </Alert>
      )}
      {ctx.people.length > 0 && (
        <PaneSection title={ctx.people.length === 1 ? 'The name as published' : 'The two names as published'}>
          <People people={ctx.people} />
        </PaneSection>
      )}
      {read && (
        <PaneSection title="What the website shows today">
          <Fields
            fields={[
              { label: 'Address checked', value: link(text(read.url)) },
              { label: 'Ends on', value: text(read.finalHost) ? <span className="font-mono text-[0.8125rem]">{text(read.finalHost)}</span> : null },
              { label: 'Page title', value: text(read.title) },
              { label: 'Athar read', value: typeof read.state === 'string' ? (WEBSITE_STATE[read.state] ?? read.state) : null },
            ]}
          />
        </PaneSection>
      )}
      <PaneSection title={ctx.startups.length > 1 ? 'To compare' : 'The startup'} className="@container">
        {ctx.startups.length === 0 ? (
          <p className="text-[0.875rem] text-ink-2">The startup this reading is about is no longer in the registry.</p>
        ) : (
          <div className="grid gap-4 @[44rem]:grid-cols-2">
            {ctx.startups.map((c) => (
              <Card key={c.id} card={c} marked={marked} />
            ))}
          </div>
        )}
      </PaneSection>
    </DeskPane>
  )
}
