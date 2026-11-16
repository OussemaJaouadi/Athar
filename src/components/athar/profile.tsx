import { Link } from '@tanstack/react-router'
import { ArrowRight, ArrowUpRight, Copy } from 'lucide-react'
import { useState } from 'react'

import { SectorSwatch, TileMark } from '@/components/athar/tile-mark'
import { useCopyToClipboard } from '@/components/interior/copy-button'
import { cn } from '@/lib/utils'
import type { getStartup } from '#/server/api/app'

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
const show = (v: unknown) => (v === null || v === undefined || v === '' ? null : Array.isArray(v) ? (v.length ? v.join(', ') : null) : String(v))

type Fact = { key: string; label: string; raw: string; value: React.ReactNode; text: string | null }

/** A startup as a catalogue record. Every fact opens the registry row it came from. */
export function Profile({ data, operator }: { data: ProfileData; compact?: boolean; operator?: boolean }) {
  const { startup, sources, chain, neighbours } = data
  const raw = sources[0] ? (JSON.parse(sources[0].raw_json) as Record<string, unknown>) : {}
  const row = chain?.rowNumber ?? sources[0]?.row_number
  const site = startup.website?.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '')
  const { copy, status } = useCopyToClipboard()

  const description: Fact = { key: 'description', label: 'Description', raw: 'desc', value: startup.description, text: startup.description }
  const facts: Fact[] = [
    { key: 'sector', label: 'Sector', raw: 'sector', text: startup.sector, value: startup.sector && <span className="inline-flex items-center gap-2"><SectorSwatch sector={startup.sector} />{startup.sector}</span> },
    { key: 'cohort', label: 'Labelled', raw: 'label', text: startup.cohort, value: monthYear(startup.cohort) },
    { key: 'creation_year', label: 'Created', raw: 'creation_year', text: startup.creation_year ? String(startup.creation_year) : null, value: startup.creation_year },
    { key: 'founders', label: 'Founders', raw: 'founders', text: startup.founders.join(', ') || null, value: startup.founders.length ? startup.founders.join(', ') : null },
    { key: 'website', label: 'Website', raw: 'website', text: startup.website, value: site && <a href={startup.website ?? undefined} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1 [overflow-wrap:anywhere]">{site}<ArrowUpRight className="size-3.5 shrink-0" aria-hidden /></a> },
  ]
  // Nothing is "selected" until the reader picks a fact; until then the source shows the description quietly.
  const [picked, setPicked] = useState<Fact | null>(null)
  const active = picked ?? description

  return (
    <article className="max-w-[72rem]">
      <header className="flex flex-wrap items-center gap-x-5 gap-y-4">
        <TileMark id={startup.id} sector={startup.sector} size={48} />
        <div className="min-w-0 flex-1">
          <h1 className="text-[2.75rem] leading-[3rem]">{startup.name}</h1>
          <p className="group mt-1 flex items-center gap-1.5 font-mono text-xs text-ink-2">
            {catalogueNo(row)}
            {row !== undefined && (
              <button type="button" onClick={() => copy(catalogueNo(row))} aria-label="Copy catalogue number" className="opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100">
                {status === 'copied' ? <span className="text-glaze">copied</span> : <Copy className="size-3" aria-hidden />}
              </button>
            )}
          </p>
        </div>
        <Link to="/" search={{ draft: startup.description ?? startup.name }} className="inline-flex h-9 items-center rounded-[4px] border border-control px-3.5 text-sm text-ink no-underline hover:bg-surface">
          Check a similar idea
        </Link>
      </header>

      <div className="mt-8 grid gap-x-12 gap-y-10 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <div className="min-w-0">
          {startup.description ? (
            <p dir="auto" className="max-w-[62ch] font-display text-[1.375rem] leading-9">
              {decode(startup.description)}
            </p>
          ) : (
            <p className="text-ink-2">The registry doesn&apos;t say what it does.</p>
          )}

          <dl className="mt-8 border-t border-hairline">
            {facts.map((f) => {
              const missing = f.value === null || f.value === undefined || f.value === ''
              const on = picked?.key === f.key
              return (
                <div key={f.key} className="border-b border-hairline">
                  <dt className="sr-only">{f.label}</dt>
                  <dd className="m-0">
                    <button
                      type="button"
                      onClick={() => setPicked(on ? null : f)}
                      aria-pressed={on}
                      className={cn('group grid min-h-10 w-full grid-cols-[10rem_minmax(0,1fr)_1rem] items-center gap-4 py-2 text-start transition-colors duration-150', on ? 'bg-surface' : 'hover:bg-surface/60')}
                    >
                      <span aria-hidden className="ps-2 text-sm text-ink-2">
                        {f.label}
                      </span>
                      <span className={cn('min-w-0 text-[0.9375rem]', missing && 'text-ink-2')}>
                        {missing ? 'The registry doesn’t say.' : f.value}
                      </span>
                      <ArrowRight aria-hidden className={cn('size-3.5 transition-opacity', on ? 'text-ochre opacity-100' : 'text-ink-2 opacity-0 group-hover:opacity-100')} />
                    </button>
                  </dd>
                </div>
              )
            })}
          </dl>
        </div>

        <aside aria-label="Source" className="lg:sticky lg:top-20 lg:self-start">
          <ChainRail fact={active} raw={raw} chain={chain} row={row} />
          {operator && startup.primary_row_id && (
            <Link to="/portal/trace/$rowId" params={{ rowId: startup.primary_row_id }} className="mt-4 inline-block text-sm">
              Full trace
            </Link>
          )}
        </aside>
      </div>

      {neighbours.length > 0 && (
        <section aria-labelledby="near-h" className="mt-12">
          <h2 id="near-h" className="border-b border-hairline pb-2 font-sans text-sm font-medium text-ink-2">
            Also {startup.sector}
          </h2>
          <ul>
            {neighbours.map((n) => (
              <li key={n.id} className="border-b border-hairline">
                <Link to="/startups/$id" params={{ id: n.id }} className="grid grid-cols-[1.25rem_12rem_minmax(0,1fr)_3rem] items-center gap-4 py-3 no-underline hover:bg-surface/60">
                  <TileMark id={n.id} sector={n.sector} size={20} />
                  <span className="truncate text-sm font-medium text-ink">{n.name}</span>
                  <span className="truncate text-sm text-ink-2">{n.description ? decode(n.description) : 'The registry doesn’t say what it does.'}</span>
                  <span className="text-end font-mono text-xs text-ink-2">{yearOf(n.cohort)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </article>
  )
}

/** Where one fact comes from. The row is quoted only when cleaning changed it. */
function ChainRail({ fact, raw, chain, row }: { fact: Fact; raw: Record<string, unknown>; chain: ProfileData['chain']; row: number | undefined }) {
  const change = chain?.changes.find((c) => c.field === fact.key)
  const original = show(raw[fact.raw])
  const stops: { title: string; body?: React.ReactNode; muted?: boolean }[] = [
    { title: chain ? `Snapshot of ${longDate(chain.fetchedAt)}` : 'Not collected yet', body: 'Startup Tunisia registry' },
    change
      ? { title: `Registry row ${row ?? '—'}`, body: original ? <span dir="auto" className="line-clamp-4 break-words">“{original}”</span> : 'empty' }
      : { title: `Registry row ${row ?? '—'}`, body: original ? 'unchanged' : 'empty', muted: !original },
    ...(change ? [{ title: 'Cleaned', body: change.why }] : []),
  ]
  return (
    <section aria-labelledby="chain-h">
      <h2 id="chain-h" className="font-sans text-sm font-medium text-ink-2">
        Source · {fact.label.toLowerCase()}
      </h2>
      <ol className="relative mt-4 grid gap-4 ps-6 before:absolute before:inset-y-1.5 before:start-[5px] before:w-px before:bg-ochre">
        {stops.map((s, i) => (
          <li key={s.title} className="relative grid gap-0.5">
            <span aria-hidden className={cn('absolute -start-6 top-1.5 size-[11px] rounded-full border-2 border-ochre', i === stops.length - 1 ? 'bg-ochre' : 'bg-canvas', s.muted && 'border-dashed border-control bg-canvas')} />
            <span className="text-sm font-medium">{s.title}</span>
            {s.body && <span className="text-sm text-ink-2">{s.body}</span>}
          </li>
        ))}
      </ol>
    </section>
  )
}
