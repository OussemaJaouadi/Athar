import { Link } from '@tanstack/react-router'
import { ArrowUpRight } from 'lucide-react'
import { useState } from 'react'

import { SectorSwatch, TileMark } from '@/components/athar/tile-mark'
import { CopyButton } from '@/components/interior/copy-button'
import { cn } from '@/lib/utils'
import type { getStartup } from '#/server/api/app'

export type ProfileData = NonNullable<Awaited<ReturnType<typeof getStartup>>>

export const longDate = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
export const yearOf = (cohort: string | null) => (cohort ? cohort.slice(3) : null)
export const catalogueNo = (row: number | null | undefined) => (row === null || row === undefined ? 'ATH-—' : `ATH-${String(row).padStart(4, '0')}`)

const decode = (t: string) => t.replace(/&amp;/g, '&').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"')
const show = (v: unknown) => (v === null || v === undefined || v === '' ? null : Array.isArray(v) ? (v.length ? v.join(', ') : null) : String(v))

type Fact = { key: string; label: string; raw: string; value: React.ReactNode; wide?: boolean }

/** A startup as a catalogue record. Every fact can be opened to show the registry row it came from. */
export function Profile({ data, operator }: { data: ProfileData; compact?: boolean; operator?: boolean }) {
  const { startup, sources, chain, neighbours } = data
  const raw = sources[0] ? (JSON.parse(sources[0].raw_json) as Record<string, unknown>) : {}
  const row = chain?.rowNumber ?? sources[0]?.row_number
  const site = startup.website?.replace(/^https?:\/\//, '').replace(/\/$/, '')

  const facts: Fact[] = [
    { key: 'sector', label: 'Sector', raw: 'sector', value: startup.sector && <span className="inline-flex items-center gap-2"><SectorSwatch sector={startup.sector} />{startup.sector}</span> },
    { key: 'cohort', label: 'Labelled', raw: 'label', value: startup.cohort },
    { key: 'creation_year', label: 'Created', raw: 'creation_year', value: startup.creation_year },
    { key: 'website', label: 'Website', raw: 'website', value: site && <a href={startup.website ?? undefined} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1 break-all">{site}<ArrowUpRight className="size-3.5 shrink-0" aria-hidden /></a> },
    { key: 'founders', label: 'Founders', raw: 'founders', value: startup.founders.length ? startup.founders.join(', ') : null, wide: true },
  ]
  const description: Fact = { key: 'description', label: 'Description', raw: 'desc', value: startup.description }
  const [active, setActive] = useState<Fact>(description)

  return (
    <article className="@container">
      <header className="flex flex-wrap items-center gap-x-5 gap-y-4">
        <TileMark id={startup.id} sector={startup.sector} size={52} />
        <div className="min-w-0 flex-1">
          <h1 className="text-[2.25rem] leading-[2.5rem] @[56rem]:text-[2.75rem] @[56rem]:leading-[3rem]">{startup.name}</h1>
          <p className="mt-1 flex items-center gap-2 font-mono text-xs text-ink-2">
            {catalogueNo(row)}
            {row !== undefined && <CopyButton value={catalogueNo(row)} label="Copy" className="text-xs" />}
          </p>
        </div>
        <Link to="/" search={{ draft: startup.description ?? startup.name }} className="inline-flex h-10 items-center rounded-full bg-glaze px-4 text-sm font-medium text-glaze-ink no-underline hover:bg-glaze-hover">
          Check an idea against it
        </Link>
      </header>

      <div className="mt-8 grid gap-x-12 gap-y-10 @[52rem]:grid-cols-[minmax(0,1fr)_17rem]">
        <div className="grid content-start gap-8">
          <button
            type="button"
            onClick={() => setActive(description)}
            aria-pressed={active.key === 'description'}
            className={cn('-mx-4 rounded-md px-4 py-3 text-start transition-colors duration-150', active.key === 'description' ? 'bg-surface' : 'hover:bg-surface/60')}
          >
            {startup.description ? (
              <p dir="auto" className="max-w-[62ch] font-display text-[1.375rem] leading-9">
                {decode(startup.description)}
              </p>
            ) : (
              <p className="text-ink-2">The registry gives no description.</p>
            )}
          </button>

          <dl className="m-0 grid grid-cols-2 gap-2 @[44rem]:grid-cols-4">
            {facts.map((f) => {
              const missing = f.value === null || f.value === undefined || f.value === ''
              const on = active.key === f.key
              return (
                <div
                  key={f.key}
                  role="button"
                  tabIndex={0}
                  aria-pressed={on}
                  onClick={() => setActive(f)}
                  onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), setActive(f))}
                  className={cn(
                    'grid cursor-pointer content-start gap-1 rounded-md px-4 py-3 outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-glaze',
                    f.wide && 'col-span-2 @[44rem]:col-span-4',
                    on ? 'bg-surface shadow-[inset_0_0_0_1px_var(--glaze)]' : missing ? 'border border-dashed border-hairline' : 'bg-surface/50 hover:bg-surface',
                  )}
                >
                  <dt className="text-xs text-ink-2">{f.label}</dt>
                  <dd className={cn('m-0 text-[0.9375rem]', missing && 'text-ink-2')}>{missing ? 'Not in the registry' : f.value}</dd>
                </div>
              )
            })}
          </dl>
        </div>

        <aside aria-label="Source" className="grid content-start gap-10 @[52rem]:sticky @[52rem]:top-20 @[52rem]:self-start">
          <ChainRail fact={active} raw={raw} chain={chain} row={row} />
          {operator && startup.primary_row_id && (
            <Link to="/portal/trace/$rowId" params={{ rowId: startup.primary_row_id }} className="-mt-6 text-sm">
              Full trace
            </Link>
          )}
          {neighbours.length > 0 && (
            <section aria-labelledby="near-h">
              <h2 id="near-h" className="font-sans text-sm font-medium text-ink-2">
                Same sector
              </h2>
              <ul className="mt-2">
                {neighbours.map((n) => (
                  <li key={n.id}>
                    <Link to="/startups/$id" params={{ id: n.id }} className="-mx-2 grid grid-cols-[1.25rem_minmax(0,1fr)_auto] items-center gap-2.5 rounded-md px-2 py-2 no-underline transition-colors hover:bg-surface">
                      <TileMark id={n.id} sector={n.sector} size={20} />
                      <span className="truncate text-sm text-ink">{n.name}</span>
                      <span className="font-mono text-xs text-ink-2">{yearOf(n.cohort)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </div>
    </article>
  )
}

/** Where one fact comes from: the snapshot, the row as downloaded, and cleaning when it changed something. */
function ChainRail({ fact, raw, chain, row }: { fact: Fact; raw: Record<string, unknown>; chain: ProfileData['chain']; row: number | undefined }) {
  const change = chain?.changes.find((c) => c.field === fact.key)
  const original = show(raw[fact.raw])
  const stops: { title: string; body?: React.ReactNode; muted?: boolean }[] = [
    { title: 'Startup Tunisia registry', body: chain ? longDate(chain.fetchedAt) : undefined },
    { title: `Row ${row ?? '—'}`, body: original ? <span dir="auto" className="line-clamp-5 break-words">“{original}”</span> : 'empty', muted: !original },
    ...(change ? [{ title: 'Cleaned', body: change.why }] : []),
  ]
  return (
    <section aria-labelledby="chain-h">
      <h2 id="chain-h" className="font-sans text-sm font-medium text-ink-2">
        {fact.label}, from the source
      </h2>
      <ol className="relative mt-4 grid gap-4 ps-6 before:absolute before:inset-y-1.5 before:start-[5px] before:w-px before:bg-ochre">
        {stops.map((s, i) => (
          <li key={s.title} className="relative grid gap-0.5">
            <span aria-hidden className={cn('absolute -start-6 top-1.5 size-[11px] rounded-full border-2 border-ochre', i === stops.length - 1 ? 'bg-ochre' : 'bg-canvas', s.muted && 'border-dashed border-control bg-canvas')} />
            <span className="text-sm font-medium">{s.title}</span>
            {s.body && <span className={cn('text-sm text-ink-2', s.muted && 'italic')}>{s.body}</span>}
          </li>
        ))}
      </ol>
    </section>
  )
}
