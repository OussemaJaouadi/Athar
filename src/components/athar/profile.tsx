import { Link } from '@tanstack/react-router'
import { ArrowUpRight } from 'lucide-react'
import { useState } from 'react'

import { TileMark } from '@/components/athar/tile-mark'
import { cn } from '@/lib/utils'
import type { Change, getStartup } from '#/server/api/app'

export type ProfileData = NonNullable<Awaited<ReturnType<typeof getStartup>>>

export const longDate = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
/** The year of a label month ('YYYY-MM'). */
export const yearOf = (labelled: string | null) => (labelled ? labelled.slice(0, 4) : null)

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const monthYear = (labelled: string | null) => {
  const m = labelled?.match(/^(\d{4})-(\d{2})$/)
  return m ? `${MONTHS[Number(m[2]) - 1]} ${m[1]}` : labelled
}
// Our observation of the website, in words. It says whether the address answered, never whether the company lives.
function websiteNote(kind: string | null, check: ProfileData['websiteCheck']) {
  if (kind === 'social') return 'A page on a social network; not checked.'
  if (!check) return null
  const when = longDate(check.checked_at)
  if (check.status === 'reachable')
    return check.final_host ? `Answers, now from ${check.final_host} (checked ${when}).` : `Answers (checked ${when}).`
  return `Does not answer since ${longDate(check.since)}: ${check.detail} (checked ${when}).`
}
const decode = (t: string) => t.replace(/&amp;/g, '&').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"')

type Fact = { key: string; label: string; value: React.ReactNode }

/**
 * A startup as a catalogue record. Everything comes from one registry row, said once under the name;
 * a fact carries a note only when cleaning changed it.
 */
export function Profile({ data, operator }: { data: ProfileData; compact?: boolean; operator?: boolean }) {
  const { startup, entries, firstSeen, lastSeen, withdrawnSince, notes, chain, neighbours, alsoFounded, websiteCheck } = data
  // "Listed N times" is said by the entries themselves; the other notes are plain facts.
  const facts2 = notes.filter((n) => n.code !== 'listed_more_than_once')
  const site = startup.website?.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '')
  const facts: Fact[] = [
    { key: 'sector', label: 'Sector', value: startup.sector },
    { key: 'labelled', label: 'Startup label', value: startup.labelled && `since ${monthYear(startup.labelled)}` },
    { key: 'creation_year', label: 'Founded', value: startup.creation_year },
    {
      key: 'founders',
      label: 'Founders',
      value: startup.founders.length ? (
        <span className="grid gap-1">
          {startup.founders.map((f) => {
            const other = alsoFounded.filter((a) => a.fn.toLowerCase() === f.trim().toLowerCase())
            return (
              <span key={f}>
                {f}
                {other.length > 0 && (
                  <span className="text-ink-2">
                    {' '}
                    · also on{' '}
                    {other.map((o, i) => (
                      <span key={o.id}>
                        {i > 0 && ', '}
                        <Link to="/startups/$id" params={{ id: o.id }}>
                          {o.name}
                        </Link>
                      </span>
                    ))}
                  </span>
                )}
              </span>
            )
          })}
        </span>
      ) : null,
    },
    {
      key: 'website',
      label: 'Website',
      value: site && (
        <span className="grid gap-0.5">
          <a href={startup.website ?? undefined} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 [overflow-wrap:anywhere]">
            {site}
            <ArrowUpRight className="size-3.5 shrink-0" aria-hidden />
          </a>
          {websiteNote(startup.website_kind, websiteCheck) && <span className="text-[0.8125rem] text-ink-2">{websiteNote(startup.website_kind, websiteCheck)}</span>}
        </span>
      ),
    },
  ]

  return (
    <article className="grid gap-x-14 gap-y-12 2xl:grid-cols-[minmax(0,7fr)_minmax(0,4fr)]">
      <div className="min-w-0">
        <header className="flex flex-wrap items-start gap-x-5 gap-y-4">
          <TileMark id={startup.id} sector={startup.sector} size={48} className="mt-1" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-x-3">
              <h1 className="text-[2.75rem] leading-[3rem]">{startup.name}</h1>
            </div>
            <p className="mt-1.5 text-sm text-ink-2">
              Startup Tunisia registry
              {firstSeen && ` · first seen ${longDate(firstSeen)}`}
              {lastSeen && ` · last checked ${longDate(lastSeen)}`}
            </p>
            {withdrawnSince && <p className="mt-1 text-sm text-ink">No longer in the registry since {longDate(withdrawnSince)}.</p>}
          </div>
          <Link to="/" search={{ draft: startup.description ?? startup.name }} className="inline-flex h-11 items-center rounded-[4px] border border-edge px-3.5 text-sm text-ink no-underline hover:bg-surface sm:h-9">
            Check a similar idea
          </Link>
        </header>

        {startup.description ? (
          <p dir="auto" className="mt-8 max-w-[62ch] font-display text-[1.375rem] leading-9">
            {decode(startup.description)}
          </p>
        ) : (
          <p className="mt-8 text-ink">The registry doesn&apos;t say what it does.</p>
        )}
        <CleanedNote change={chain?.changes.find((c) => c.field === 'description')} />

        <dl className="mt-8 max-w-[48rem] border-t border-hairline">
          {facts.map((f) => (
            <FactRow key={f.key} fact={f} change={chain?.changes.find((c) => c.field === f.key)} />
          ))}
        </dl>

        <section aria-labelledby="source-h" className="mt-10 max-w-[48rem]">
          <h2 id="source-h" className="border-b border-hairline pb-2 font-sans text-sm font-medium text-ink-2">
            Where this comes from
          </h2>
          <dl className="border-hairline">
            <div className="grid grid-cols-[9rem_minmax(0,1fr)] gap-x-4 border-b border-hairline py-2.5">
              <dt className="text-sm text-ink-2">Listed</dt>
              <dd className="m-0 grid min-w-0 gap-1 text-[0.9375rem] text-ink">
                <span>{entries.length === 1 ? 'Once in the registry' : `${entries.length} times in the registry`}</span>
                {entries.map((e) => (
                  <span key={e.id} className="text-sm">
                    <span className="font-mono text-[0.8125rem] select-all">entry {e.id}</span>
                    <span className="text-ink-2">
                      {' '}
                      · seen {longDate(e.firstSeen)}
                      {e.lastSeen.slice(0, 10) !== e.firstSeen.slice(0, 10) && ` to ${longDate(e.lastSeen)}`}
                      {e.copies > 1 && ` · published ${e.copies} times, word for word`}
                      {entries.length > 1 && e.primary && ' · the values above'}
                    </span>
                  </span>
                ))}
              </dd>
            </div>
            {facts2.length > 0 && (
              <div className="grid grid-cols-[9rem_minmax(0,1fr)] gap-x-4 border-b border-hairline py-2.5">
                <dt className="text-sm text-ink-2">Noted</dt>
                <dd className="m-0 grid min-w-0 gap-1 text-[0.9375rem] text-ink">
                  {facts2.map((n) => (
                    <span key={n.code + n.text}>{n.text}</span>
                  ))}
                </dd>
              </div>
            )}
          </dl>
          {operator && (
            <a href={`/portal/trace?startup=${encodeURIComponent(startup.id)}`} className="mt-4 inline-block text-sm">
              Open in the operator trace
            </a>
          )}
        </section>
      </div>

      {neighbours.length > 0 && (
        <section aria-labelledby="near-h" className="2xl:pt-3">
          <h2 id="near-h" className="border-b border-hairline pb-2 font-sans text-sm font-medium text-ink-2">
            Also {startup.sector}
          </h2>
          <ul>
            {neighbours.map((n) => (
              <li key={n.id} className="border-b border-hairline">
                <Link to="/startups/$id" params={{ id: n.id }} className="grid grid-cols-[1.25rem_minmax(0,1fr)_auto] gap-x-3 gap-y-1 py-3 no-underline -outline-offset-2 hover:bg-surface">
                  <TileMark id={n.id} sector={n.sector} size={20} className="mt-0.5" />
                  <span className="truncate text-sm font-medium text-ink">{n.name}</span>
                  <span className="font-mono text-[0.8125rem] text-ink-3">{yearOf(n.labelled)}</span>
                  <span className="col-start-2 col-end-4 line-clamp-2 text-sm text-ink">{n.description ? decode(n.description) : 'The registry doesn’t say what it does.'}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </article>
  )
}

function FactRow({ fact, change }: { fact: Fact; change?: Change }) {
  const missing = fact.value === null || fact.value === undefined || fact.value === ''
  return (
    <div className="grid grid-cols-[9rem_minmax(0,1fr)] gap-x-4 border-b border-hairline py-2.5">
      <dt className="text-sm text-ink-2">{fact.label}</dt>
      <dd className="m-0 min-w-0">
        <span className={cn('text-[0.9375rem] text-ink', missing && 'text-ink-2')}>{missing ? 'The registry doesn’t say.' : fact.value}</span>
        <CleanedNote change={change} />
      </dd>
    </div>
  )
}

/** Shown only when cleaning changed a value: opens to before, after and why. */
function CleanedNote({ change }: { change?: Change }) {
  const [open, setOpen] = useState(false)
  if (!change) return null
  return (
    <div className="mt-1 text-[0.8125rem]">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="inline-flex min-h-8 items-center gap-2 text-ink-2 underline decoration-dotted underline-offset-4 hover:text-ink">
        <span aria-hidden className="size-2 shrink-0 bg-ochre" />
        cleaned
      </button>
      {open && (
        <p className="mt-1.5 grid gap-0.5 text-ink">
          <span className="[overflow-wrap:anywhere]">
            Before: <span className="font-mono">{change.from ?? 'empty'}</span>
          </span>
          <span className="[overflow-wrap:anywhere]">
            After: <span className="font-mono">{change.to ?? 'removed'}</span>
          </span>
          <span>{change.why}</span>
        </p>
      )}
    </div>
  )
}
