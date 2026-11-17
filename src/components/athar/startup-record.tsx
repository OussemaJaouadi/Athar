import { Link } from '@tanstack/react-router'

import type { Neighbour, StartupPage } from '#/server/api/startup'
import { bareAddress, websiteAnswers, websiteReason, type WebsiteCheck } from '#/shared/website'

// The startup page (direction C, picked by the owner on 17 Nov 2026): the record stays on the left,
// everything the data connects to it stands on the right. Every list is a relation in the data model.

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const month = (labelled: string | null, short = false) => {
  if (!labelled) return null
  const name = MONTHS[Number(labelled.slice(5, 7)) - 1]
  return `${short ? name.slice(0, 3) : name} ${labelled.slice(0, 4)}`
}
const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve']
const word = (n: number) => WORDS[n] ?? String(n)
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** Filled square: the website answers. Open square: it does not. The shape carries it, not a colour. */
function SiteState({ check, none = 'No website to ask.' }: { check: WebsiteCheck | null; none?: string }) {
  if (!check) return <span>{none}</span>
  const up = websiteAnswers(check)
  return (
    <span className="inline-flex items-baseline gap-2">
      <span aria-hidden className={`inline-block size-2.5 shrink-0 translate-y-px border-[1.5px] border-ink ${up ? 'bg-ink' : ''}`} />
      <span>
        <span className="font-normal">{up ? 'Website answers' : 'Website does not answer'}</span>
        {up ? check.finalHost && `, from ${check.finalHost}` : `: ${websiteReason(check.detail)}`}
      </span>
    </span>
  )
}

function Block({ title, count, children }: { title: string; count?: React.ReactNode; children: React.ReactNode }) {
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

const Sentence = ({ children }: { children: React.ReactNode }) => <p className="max-w-[62ch] text-base font-normal">{children}</p>

/** What the neighbours say together: how many, when relative to this startup, and how many websites answer today. */
function ideaSentence(data: StartupPage): string {
  const { startup, sameIdea, compared, check } = data
  if (!startup.description) return 'The registry publishes no description for this startup, so it cannot be compared with the others.'
  if (!compared) return 'Not compared yet: Embed has not run since this startup was collected.'
  if (!sameIdea.length) return 'No other startup in the registry describes a similar idea.'
  const n = sameIdea.length
  const self = startup.labelled ?? ''
  const before = sameIdea.filter((s) => (s.labelled ?? '') < self).length
  const after = sameIdea.filter((s) => (s.labelled ?? '') > self).length
  const same = n - before - after
  const when = [before && `${word(before)} before this one`, same && `${word(same)} in the same month`, after && `${word(after)} after`].filter(Boolean).join(', ')
  const asked = [check, ...sameIdea.map((s) => s.check)].filter((c): c is WebsiteCheck => !!c)
  const silent = asked.filter((c) => !websiteAnswers(c)).length
  const sites = !asked.length
    ? ''
    : silent === 0
      ? ` All ${word(asked.length)} websites answer today.`
      : ` Of the ${word(asked.length)} websites, ${word(silent)} ${silent === 1 ? 'does' : 'do'} not answer today.`
  return `${cap(word(n))} ${n === 1 ? 'startup describes' : 'startups describe'} a similar idea. By label date: ${when}.${sites}`
}

function NeighbourRow({ s }: { s: Neighbour }) {
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_max-content] gap-x-5 gap-y-0.5 border-b border-hairline py-3">
      <Link to="/startups/$id" params={{ id: s.id }} className="font-display text-xl leading-snug font-bold text-ink" dir="auto">
        {s.name}
      </Link>
      <span className="text-end text-sm whitespace-nowrap tabular-nums">{s.labelled ? `Labelled ${month(s.labelled, true)}` : ''}</span>
      {s.description && (
        <p className="col-span-full line-clamp-2 max-w-[70ch] text-sm" dir="auto">
          {s.description}
        </p>
      )}
      <p className="col-span-full text-sm">
        <SiteState check={s.check} />
      </p>
    </li>
  )
}

export function StartupRecord({ data, operator }: { data: StartupPage; operator?: boolean }) {
  const { startup, source, notes, changes, check, people, sameIdea, sectorYear } = data
  const repeat = people.filter((p) => p.others.length > 0)
  const websiteChange = changes.find((c) => c.field === 'website')
  const year = sectorYear.year ? Number(sectorYear.year) : undefined
  const shownOthers = sectorYear.others.slice(0, 14)

  const facts: [string, React.ReactNode][] = [
    ['Sector', startup.sector && <Link to="/search" search={{ sector: startup.sector }}>{startup.sector}</Link>],
    ['Labelled', startup.labelled && <Link to="/search" search={{ from: year, to: year }}>{month(startup.labelled)}</Link>],
    ['Created', startup.creationYear],
    ['Founders', people.length ? people.map((p) => p.name).join(', ') : null],
    [
      'Website',
      startup.website ? (
        <span className="grid gap-0.5">
          <a href={startup.website} target="_blank" rel="noreferrer">
            {bareAddress(startup.website)}
          </a>
          {startup.websiteKind === 'social' ? (
            <span>A page on a social network. Not asked: such pages answer whether or not they still exist.</span>
          ) : check ? (
            <>
              <SiteState check={check} />
              <span>Asked on {day(check.checkedAt)}.</span>
            </>
          ) : (
            <span>Not asked yet.</span>
          )}
          {websiteChange && <span>As read from the registry: {websiteChange.why.toLowerCase()}.</span>}
        </span>
      ) : (
        'None in the registry.'
      ),
    ],
    ...notes.map((n): [string, React.ReactNode] => ['Also', n.text]),
  ]

  return (
    <article className="grid items-start gap-x-12 gap-y-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <div className="grid gap-7 lg:sticky lg:top-6">
        <header className="grid gap-2.5">
          <h1 className="font-display text-[2.125rem] leading-[1.1] font-bold text-balance sm:text-[2.75rem]" dir="auto">
            {startup.name}
          </h1>
          <p className="text-sm">
            From registry row{' '}
            {operator ? (
              <Link to="/portal/trace/$rowId" params={{ rowId: source.entryId }} className="font-mono text-[0.8125rem]">
                {source.entryId}
              </Link>
            ) : (
              <span className="font-mono text-[0.8125rem]">{source.entryId}</span>
            )}
            {source.published && `, as published on ${day(source.published)}`}.
            {source.listed > 1 && ` The registry lists it ${word(source.listed)} times.`}
            {source.withdrawnSince && ` It is no longer in the registry since ${day(source.withdrawnSince)}.`}
          </p>
        </header>

        {startup.description ? (
          <p className="max-w-[34ch] font-display text-[1.3125rem] leading-[1.4] text-pretty sm:text-2xl" dir="auto">
            {startup.description}
          </p>
        ) : (
          <p className="max-w-[40ch] border border-dashed border-edge px-4 py-3 text-[0.9375rem]">The registry publishes no description for this startup.</p>
        )}

        <dl className="grid grid-cols-[max-content_minmax(0,1fr)] border-t border-edge">
          {facts
            .filter(([, value]) => value !== null && value !== undefined && value !== '')
            .map(([label, value], i) => (
              <div key={`${label}${i}`} className="col-span-full grid grid-cols-subgrid border-b border-hairline">
                <dt className="py-2.5 pe-7 text-sm text-ink-2">{label}</dt>
                <dd className="py-2.5 font-normal [overflow-wrap:anywhere]">{value}</dd>
              </div>
            ))}
        </dl>
      </div>

      <div className="grid min-w-0 gap-9">
        <Block title="Same idea" count={sameIdea.length || undefined}>
          <Sentence>{ideaSentence(data)}</Sentence>
          {sameIdea.length > 0 && (
            <ul className="border-t border-edge">
              {sameIdea.map((s) => (
                <NeighbourRow key={s.id} s={s} />
              ))}
            </ul>
          )}
        </Block>

        <Block title="Same people" count={repeat.length || undefined}>
          {repeat.length ? (
            <ul className="border-t border-edge">
              {repeat.map((p) => (
                <li key={p.personKey} className="grid grid-cols-[minmax(0,1fr)_max-content] gap-x-5 gap-y-0.5 border-b border-hairline py-3">
                  <span className="font-display text-xl leading-snug font-bold" dir="auto">
                    {p.name}
                  </span>
                  <span className="text-end text-sm whitespace-nowrap">{word(p.others.length + 1)} startups</span>
                  <p className="col-span-full max-w-[70ch] text-sm">
                    Also a founder of{' '}
                    {p.others.map((o, i) => (
                      <span key={o.id}>
                        {i > 0 && (i === p.others.length - 1 ? ' and ' : ', ')}
                        <Link to="/startups/$id" params={{ id: o.id }}>
                          {o.name}
                        </Link>
                        {[o.sector, o.labelled && `labelled in ${o.labelled.slice(0, 4)}`].filter(Boolean).map((t) => `, ${t}`)}
                      </span>
                    ))}
                    .
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <Sentence>{people.length ? 'None of its founders appears on another startup in the registry.' : 'The registry names no founder.'}</Sentence>
          )}
        </Block>

        {sectorYear.sector && sectorYear.year && (
          <Block title="Same sector, same year" count={`${sectorYear.sector} · ${sectorYear.year}`}>
            <Sentence>
              {sectorYear.sector} has {sectorYear.sectorTotal} startups in the registry.{' '}
              {sectorYear.others.length
                ? `${cap(word(sectorYear.others.length))} ${sectorYear.others.length === 1 ? 'other was' : 'others were'} labelled in ${sectorYear.year}.`
                : `No other was labelled in ${sectorYear.year}.`}
            </Sentence>
            {shownOthers.length > 0 && (
              <p className="max-w-[70ch] text-[0.9375rem] leading-7">
                {shownOthers.map((o, i) => (
                  <span key={o.id}>
                    {i > 0 && ' · '}
                    <Link to="/startups/$id" params={{ id: o.id }}>
                      {o.name}
                    </Link>
                  </span>
                ))}
                {sectorYear.others.length > shownOthers.length && (
                  <>
                    {' · '}
                    <Link to="/search" search={{ sector: sectorYear.sector, from: year, to: year }}>
                      all {sectorYear.others.length + 1}
                    </Link>
                  </>
                )}
              </p>
            )}
          </Block>
        )}
      </div>
    </article>
  )
}
