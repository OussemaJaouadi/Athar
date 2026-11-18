import { Info } from 'lucide-react'

import { StartupTitle } from '@/components/athar/startup-title'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { Said, StartupStory } from '#/server/pipeline/story'
import { bareAddress } from '#/shared/website'

// What the pipeline knows about how startups and people connect, said in the page's own voice.
// A settled reading is said plainly. An inferred one carries its qualifier in the sentence (the pipeline words that)
// and a small quiet mark that opens the reason. An unconfirmed one says so. No lane is ever named on screen.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export const shortDay = (iso: string) => {
  const d = new Date(iso)
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}

export function Block({ title, count, children }: { title: string; count?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="grid min-w-0 gap-3">
      <h2 className="font-sans text-sm font-medium tracking-[0.05em] uppercase">
        {title}
        {count !== undefined && <span className="ms-2 font-mono text-[0.8125rem] tracking-normal normal-case">{count}</span>}
      </h2>
      {children}
    </section>
  )
}

/** The one quiet mark for "this is read from the data, not settled": opens the reason. Nothing for a settled reading. */
export function Why({ said }: { said: Said }) {
  if (said.lane === 'rule' || !said.why) return null
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Why Athar says this"
          className="inline-grid size-6 shrink-0 place-items-center rounded-full align-middle text-ink-2 hover:text-ink focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
        >
          <Info aria-hidden className="size-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 rounded-md border border-edge bg-surface p-3 text-sm text-ink ring-0">
        {said.why}
      </PopoverContent>
    </Popover>
  )
}

const OTHER_NAME_FROM = { description: 'in its description', email: 'in its email address', acronym: 'its initials' } as const

/** "Also appears as Aerobot (in its description)": one line, each name with the wording its lane earns. */
export function OtherNames({ names }: { names: StartupStory['otherNames'] }) {
  if (!names.length) return null
  return (
    <p className="text-sm">
      {names.map((n, i) => {
        const lead = n.said.lane === 'rule' ? 'Also appears as' : n.said.lane === 'inferred' ? 'Likely also written' : 'May also be written'
        const tail = n.said.lane === 'review' ? '; not confirmed' : ''
        return (
          <span key={`${n.from}${n.name}`}>
            {i > 0 && ' · '}
            {lead}{' '}
            <span className={n.from === 'email' ? 'font-mono text-[0.8125rem]' : 'font-normal'} dir="auto">
              {n.name}
            </span>{' '}
            ({OTHER_NAME_FROM[n.from]}){tail}
            <Why said={n.said} />
          </span>
        )
      })}
    </p>
  )
}

/** What the website shows today, as a sentence. `reason` is the plain-words cause of a silence, when the check kept one. */
export function websiteSentence(site: NonNullable<StartupStory['website']>, reason?: string | null): string {
  const lane = site.said.lane
  const host = site.finalHost ? bareAddress(site.finalHost) : 'another address'
  switch (site.state) {
    case 'answers':
      return 'The website answers.'
    case 'moved':
      return lane === 'rule' ? `The website has moved to ${host}.` : lane === 'inferred' ? `The website appears to have moved to ${host}.` : `The website answers from ${host}; whether that is the same venture is not confirmed.`
    case 'parked':
      return lane === 'rule' ? 'The website is parked or for sale.' : lane === 'inferred' ? 'The website appears to be parked or for sale.' : 'The website may be parked or for sale; not confirmed.'
    case 'silent':
      return `The website has not answered since ${shortDay(site.since)}${reason ? `: ${reason}` : ''}.`
    case 'unrelated':
      return `The website answers from ${host}, an address unrelated to the startup's own; whose it is is not confirmed.`
    case 'elsewhere':
      return `The website is a page on ${host}, not a site of its own.`
    default:
      return 'The website answers.'
  }
}

/** The site's own title and summary, quoted and attributed: first-hand evidence, set apart from the registry's description. */
export function InItsOwnWords({ site }: { site: NonNullable<StartupStory['website']> }) {
  // Only a site that is still the startup's own speaks for it: a parked, for-sale or unrelated page does not.
  if ((site.state !== 'answers' && site.state !== 'moved') || (!site.title && !site.summary)) return null
  return (
    <figure className="grid max-w-[44ch] gap-1.5 border-s-2 border-edge ps-4">
      <figcaption className="text-sm text-ink-2">
        In its own words, from {bareAddress(site.url)}, read on {shortDay(site.checkedAt)}:
      </figcaption>
      <blockquote className="grid gap-1">
        {site.title && (
          <p className="text-base font-medium" dir="auto">
            {site.title}
          </p>
        )}
        {site.summary && (
          <p className="text-[0.9375rem]" dir="auto">
            {site.summary}
          </p>
        )}
      </blockquote>
    </figure>
  )
}

function VentureRow({ v }: { v: StartupStory['ventures'][number] }) {
  const year = v.startup.creationYear
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_max-content] gap-x-5 gap-y-1 border-b border-hairline py-3">
      <StartupTitle id={v.startup.id} name={v.startup.name} sector={v.startup.sector} />
      <span className="text-end text-sm whitespace-nowrap tabular-nums">{year ? `Created ${year}` : ''}</span>
      <p className="col-span-full max-w-[62ch] text-base font-normal">
        {v.sentence}
        <Why said={v.said} />
      </p>
      {!v.nameOnly && v.sharedFounders.length > 0 && (
        <p className="col-span-full text-sm">
          In common:{' '}
          <span className="font-normal" dir="auto">
            {v.sharedFounders.join(', ')}
          </span>
        </p>
      )}
    </li>
  )
}

/** Same founders, other ventures. Name-only ties come last under their own quiet heading. Renders nothing without ventures. */
export function Ventures({ ventures }: { ventures: StartupStory['ventures'] }) {
  if (!ventures.length) return null
  const sure = ventures.filter((v) => !v.nameOnly)
  const nameOnly = ventures.filter((v) => v.nameOnly)
  return (
    <Block title={sure.length ? 'Same founders, other ventures' : 'Possible other ventures'} count={sure.length || undefined}>
      {sure.length > 0 && (
        <ul className="border-t border-edge">
          {sure.map((v) => (
            <VentureRow key={v.startup.id} v={v} />
          ))}
        </ul>
      )}
      {nameOnly.length > 0 && (
        <div className="grid gap-1.5">
          <h3 className="text-sm font-normal text-ink-2">Same name, not confirmed as the same person</h3>
          <ul className="border-t border-edge">
            {nameOnly.map((v) => (
              <VentureRow key={v.startup.id} v={v} />
            ))}
          </ul>
        </div>
      )}
    </Block>
  )
}

const isUrl = (s: string) => /^https?:\/\//i.test(s)

/** The owner's own notes: added on this install, never registry data. */
export function Notes({ notes }: { notes: StartupStory['notes'] }) {
  if (!notes.length) return null
  return (
    <Block title="Notes" count={notes.length}>
      <p className="max-w-[62ch] text-sm">Added on this install. They are not registry data.</p>
      <ul className="border-t border-edge">
        {notes.map((n) => (
          <li key={n.id} className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-5 gap-y-0.5 border-b border-hairline py-3">
            <span className="text-sm tabular-nums">{shortDay(n.onDate ?? n.createdAt)}</span>
            <p className="max-w-[62ch] text-base font-normal [overflow-wrap:anywhere]" dir="auto">
              <span className="text-sm font-normal text-ink-2">{n.kind}: </span>
              {n.text}
            </p>
            {n.source && (
              <p className="col-start-2 text-sm [overflow-wrap:anywhere]">
                Source:{' '}
                {isUrl(n.source) ? (
                  <a href={n.source} target="_blank" rel="noreferrer">
                    {bareAddress(n.source)}
                  </a>
                ) : (
                  n.source
                )}
              </p>
            )}
          </li>
        ))}
      </ul>
    </Block>
  )
}
