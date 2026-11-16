import { Link } from '@tanstack/react-router'
import { ArrowUpRight, Lightbulb } from 'lucide-react'
import { useState } from 'react'

import { SectorSwatch, TileMark } from '@/components/athar/tile-mark'
import { cn } from '@/lib/utils'
import type { getStartup } from '#/server/api/app'

export type ProfileData = NonNullable<Awaited<ReturnType<typeof getStartup>>>

export const longDate = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
export const yearOf = (cohort: string | null) => (cohort ? cohort.slice(3) : null)

const decode = (t: string) => t.replace(/&amp;/g, '&').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"')
const LANG = (t: string) => (/[؀-ۿ]/.test(t) ? 'Arabic' : /\b(le|la|les|des|une|est|pour|avec|qui)\b/i.test(t) ? 'French' : 'English')

type Fact = { key: string; label: string; value: React.ReactNode; wide?: boolean }

/**
 * A startup as a fact sheet: one tile, the facts every record shares, what it told the registry,
 * the chain from download to record, and its neighbours. A missing fact is an open tile.
 */
export function Profile({ data, compact, operator }: { data: ProfileData; compact?: boolean; operator?: boolean }) {
  const { startup, sources, chain, neighbours } = data
  const [showRow, setShowRow] = useState(false)
  const site = startup.website?.replace(/^https?:\/\//, '').replace(/\/$/, '')
  const row = chain?.rowNumber ?? sources[0]?.row_number
  const changed = new Set(chain?.changes.map((c) => c.field))

  const facts: Fact[] = [
    { key: 'sector', label: 'Sector', value: startup.sector && <span className="inline-flex items-center gap-2"><SectorSwatch sector={startup.sector} />{startup.sector}</span> },
    { key: 'cohort', label: 'Labelled', value: startup.cohort },
    { key: 'creation_year', label: 'Created', value: startup.creation_year },
    { key: 'website', label: 'Website', value: site && <a href={startup.website ?? undefined} target="_blank" rel="noreferrer" className="break-all">{site}</a> },
    { key: 'founders', label: 'Founders', value: startup.founders.length ? startup.founders.join(', ') : null, wide: true },
  ]

  return (
    <article className={cn('grid gap-10', compact ? 'px-6 py-8 xl:px-10' : 'px-4 py-8 sm:px-8 lg:px-12 lg:py-12')}>
      <header className="flex flex-wrap items-start gap-x-6 gap-y-5">
        <TileMark id={startup.id} sector={startup.sector} size={compact ? 64 : 80} />
        <div className="min-w-0 flex-1">
          <p className="font-mono text-xs text-ink-2">
            Startup Tunisia registry{row !== undefined && ` · row ${row}`}
            {chain && ` · snapshot ${longDate(chain.fetchedAt)}`}
          </p>
          <h1 className="mt-1 text-[2.25rem] leading-[2.5rem] sm:text-[2.75rem] sm:leading-[3rem]">{startup.name}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/" search={{ draft: startup.description ?? startup.name }} className="inline-flex h-10 items-center gap-2 rounded-full bg-glaze px-4 text-sm font-medium text-glaze-ink no-underline hover:bg-glaze-hover">
            <Lightbulb className="size-4" aria-hidden /> Check an idea like this
          </Link>
          {startup.website && (
            <a href={startup.website} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-2 rounded-full border border-control px-4 text-sm text-ink no-underline hover:bg-surface">
              Website <ArrowUpRight className="size-4" aria-hidden />
            </a>
          )}
        </div>
      </header>

      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
        {facts.map((f) => {
          const missing = f.value === null || f.value === undefined || f.value === ''
          return (
            <div key={f.key} className={cn('grid content-start gap-1.5 rounded-md px-4 py-3.5', f.wide && 'col-span-2', missing ? 'border border-dashed border-control' : 'bg-surface')}>
              <dt className="flex items-center justify-between gap-2 text-xs text-ink-2">
                {f.label}
                {!missing && changed.has(f.key) && <span className="text-ochre-text">cleaned</span>}
              </dt>
              <dd className={cn('m-0', missing ? 'text-sm text-ink-2' : 'text-[0.9375rem]')}>{missing ? 'Not in the registry' : f.value}</dd>
            </div>
          )
        })}
      </dl>

      <section aria-labelledby="told-h" className="grid gap-4">
        <div className="flex flex-wrap items-baseline justify-between gap-3 border-t border-hairline pt-4">
          <h2 id="told-h" className="text-xl">What it told the registry</h2>
          {startup.description && <span className="text-xs text-ink-2">{LANG(startup.description)}, as written</span>}
        </div>
        {startup.description ? (
          <blockquote dir="auto" className="m-0 max-w-[62ch] border-s-2 border-ochre ps-5 font-display text-[1.375rem] leading-9">
            {decode(startup.description)}
          </blockquote>
        ) : (
          <p className="max-w-[62ch] rounded-md border border-dashed border-control px-5 py-4 text-ink-2">The registry lists this startup without a description. It stays an open tile until a source fills it.</p>
        )}
      </section>

      {chain && (
        <section aria-labelledby="chain-h" className="grid gap-4">
          <div className="flex flex-wrap items-baseline justify-between gap-3 border-t border-hairline pt-4">
            <h2 id="chain-h" className="text-xl">Where every fact comes from</h2>
            <button type="button" onClick={() => setShowRow((v) => !v)} aria-expanded={showRow} className="text-sm text-glaze underline underline-offset-4">
              {showRow ? 'Hide the row' : `Show row ${chain.rowNumber} as downloaded`}
            </button>
          </div>
          <ol className="grid gap-px overflow-hidden rounded-md border border-hairline bg-hairline sm:grid-cols-4">
            {[
              ['Downloaded', `Startup Tunisia registry, ${longDate(chain.fetchedAt)}`],
              ['Kept as', `row ${chain.rowNumber} of snapshot ${chain.snapshot}`],
              ['Cleaned', chain.changes.length ? `${chain.changes.length} ${chain.changes.length === 1 ? 'field' : 'fields'} changed, originals kept` : 'nothing needed changing'],
              ['Catalogued', sources.length > 1 ? `${sources.length} rows merged into this record` : 'one row, one record'],
            ].map(([k, v], i) => (
              <li key={k} className="grid gap-1 bg-canvas px-4 py-3.5">
                <span className="flex items-center gap-2 text-xs text-ink-2">
                  <span aria-hidden className="grid size-5 place-content-center rounded-full bg-ochre font-mono text-[0.625rem] text-canvas">
                    {i + 1}
                  </span>
                  {k}
                </span>
                <span className="text-sm">{v}</span>
              </li>
            ))}
          </ol>
          {chain.changes.length > 0 && (
            <ul className="grid max-w-[70ch] gap-1.5 text-sm">
              {chain.changes.map((c) => (
                <li key={c.field} className="grid grid-cols-[7rem_minmax(0,1fr)] gap-3">
                  <span className="text-ink-2">{c.field.replace('_', ' ')}</span>
                  <span>
                    {c.why}
                    {c.from && <span className="block truncate font-mono text-xs text-ink-2">was: {c.from}</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {showRow && sources[0] && (
            <dl className="grid max-w-[70ch] grid-cols-[auto_minmax(0,1fr)] gap-x-6 gap-y-2 rounded-md bg-surface px-5 py-4 text-sm">
              {Object.entries(JSON.parse(sources[0].raw_json) as Record<string, unknown>).map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="font-mono text-xs whitespace-nowrap text-ink-2">{k}</dt>
                  <dd className="m-0 break-words">{v === null || v === '' ? <em className="text-ink-2">empty</em> : Array.isArray(v) ? v.join(', ') : String(v)}</dd>
                </div>
              ))}
            </dl>
          )}
          {operator && startup.primary_row_id && (
            <Link to="/portal/trace/$rowId" params={{ rowId: startup.primary_row_id }} className="w-fit text-sm">
              Open the full trace in the operator portal
            </Link>
          )}
        </section>
      )}

      {neighbours.length > 0 && (
        <section aria-labelledby="near-h" className="grid gap-4">
          <div className="flex flex-wrap items-baseline justify-between gap-3 border-t border-hairline pt-4">
            <h2 id="near-h" className="text-xl">Near it in the registry</h2>
            <span className="text-xs text-ink-2">Same sector, closest labelling year</span>
          </div>
          <ul className="grid gap-2 sm:grid-cols-2 2xl:grid-cols-5">
            {neighbours.map((n) => (
              <li key={n.id}>
                <Link to="/startups/$id" params={{ id: n.id }} className="grid h-full content-start gap-2 rounded-md border border-hairline p-3.5 no-underline hover:border-control">
                  <span className="flex items-center gap-2.5">
                    <TileMark id={n.id} sector={n.sector} size={24} />
                    <span className="truncate font-display font-bold text-ink">{n.name}</span>
                  </span>
                  <span className="line-clamp-2 text-xs leading-5 text-ink-2">{n.description ? decode(n.description) : 'No description in the registry.'}</span>
                  <span className="font-mono text-[0.6875rem] text-ink-2">labelled {yearOf(n.cohort) ?? '—'}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </article>
  )
}
