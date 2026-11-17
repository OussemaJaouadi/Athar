import { Link } from '@tanstack/react-router'
import { ArrowUpRight } from 'lucide-react'
import { useState } from 'react'

import { TileMark } from '@/components/athar/tile-mark'
import { cn } from '@/lib/utils'
import type { Change, getStartup } from '#/server/api/app'

export type ProfileData = NonNullable<Awaited<ReturnType<typeof getStartup>>>

export const longDate = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
export const yearOf = (cohort: string | null) => (cohort ? cohort.slice(3) : null)
export const catalogueNo = (row: number | null | undefined) => (row === null || row === undefined ? 'ATH-—' : `ATH-${String(row).padStart(4, '0')}`)

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const monthYear = (cohort: string | null) => {
  const m = cohort?.match(/^(\d{2})\/(\d{4})$/)
  return m ? `${MONTHS[Number(m[1]) - 1]} ${m[2]}` : cohort
}
const decode = (t: string) => t.replace(/&amp;/g, '&').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"')

type Fact = { key: string; label: string; value: React.ReactNode }

/**
 * A startup as a catalogue record. Everything comes from one registry row, said once under the name;
 * a fact carries a note only when cleaning changed it.
 */
export function Profile({ data, operator }: { data: ProfileData; compact?: boolean; operator?: boolean }) {
  const { startup, sources, chain, neighbours, alsoFounded } = data
  const row = chain?.rowNumber ?? sources[0]?.row_number
  const site = startup.website?.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '')
  const facts: Fact[] = [
    { key: 'sector', label: 'Sector', value: startup.sector },
    { key: 'cohort', label: 'Startup label', value: startup.cohort && `since ${monthYear(startup.cohort)}` },
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
    { key: 'website', label: 'Website', value: site && <a href={startup.website ?? undefined} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 [overflow-wrap:anywhere]">{site}<ArrowUpRight className="size-3.5 shrink-0" aria-hidden /></a> },
  ]

  return (
    <article className="grid gap-x-14 gap-y-12 2xl:grid-cols-[minmax(0,7fr)_minmax(0,4fr)]">
      <div className="min-w-0">
        <header className="flex flex-wrap items-start gap-x-5 gap-y-4">
          <TileMark id={startup.id} sector={startup.sector} size={48} className="mt-1" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-x-3">
              <h1 className="text-[2.75rem] leading-[3rem]">{startup.name}</h1>
              <span className="font-mono text-[0.8125rem] text-ink-3 select-all">{catalogueNo(row)}</span>
            </div>
            <p className="mt-1.5 text-sm text-ink-2">
              Startup Tunisia registry{row !== undefined && `, row ${row}`}
              {chain && `, snapshot of ${longDate(chain.fetchedAt)}`}
            </p>
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

        {operator && startup.primary_row_id && (
          <Link to="/portal/trace/$rowId" params={{ rowId: startup.primary_row_id }} className="mt-4 inline-block text-sm">
            Open in the operator trace
          </Link>
        )}
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
                  <span className="font-mono text-[0.8125rem] text-ink-3">{yearOf(n.cohort)}</span>
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
