import { Link } from '@tanstack/react-router'
import { ArrowUpRight } from 'lucide-react'
import { useState } from 'react'

import { SectorSwatch, TileMark } from '@/components/athar/tile-mark'
import { CopyButton } from '@/components/interior/copy-button'
import { Mark, MarkerText } from '@/components/kokonutui/marker-text'
import { cn } from '@/lib/utils'
import type { getStartup } from '#/server/api/app'

export type ProfileData = NonNullable<Awaited<ReturnType<typeof getStartup>>>

export const longDate = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
export const yearOf = (cohort: string | null) => (cohort ? cohort.slice(3) : null)
export const catalogueNo = (row: number | null | undefined) => (row === null || row === undefined ? 'ATH-—' : `ATH-${String(row).padStart(4, '0')}`)

const decode = (t: string) => t.replace(/&amp;/g, '&').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"')
const show = (v: unknown) => (v === null || v === undefined || v === '' ? null : Array.isArray(v) ? (v.length ? v.join(', ') : null) : String(v))

type Field = {
  key: string
  label: string
  /** The registry column this value was read from; derived fields have none. */
  raw?: string
  value: React.ReactNode
  derived?: string
}

type Group = { title: string; fields: Field[] }

/**
 * A startup as a catalogue record: number and name, then a definition table in four groups.
 * Every value carries an ochre source mark; choosing it shows that value's chain beside the table,
 * from the registry snapshot to this record. A missing value is said, never hidden.
 */
export function Profile({ data, operator }: { data: ProfileData; compact?: boolean; operator?: boolean }) {
  const { startup, sources, chain, neighbours } = data
  const raw = sources[0] ? (JSON.parse(sources[0].raw_json) as Record<string, unknown>) : {}
  const row = chain?.rowNumber ?? sources[0]?.row_number
  const site = startup.website?.replace(/^https?:\/\//, '').replace(/\/$/, '')

  const groups: Group[] = [
    {
      title: 'Identification',
      fields: [
        { key: 'sector', label: 'Sector', raw: 'sector', value: startup.sector && <span className="inline-flex items-center gap-2"><SectorSwatch sector={startup.sector} />{startup.sector}</span> },
        { key: 'cohort', label: 'Labelled', raw: 'label', value: startup.cohort },
        { key: 'creation_year', label: 'Created', raw: 'creation_year', value: startup.creation_year },
        { key: 'row', label: 'Registry row', value: row !== undefined ? <span className="font-mono text-sm">row {row}</span> : null, derived: 'Athar numbers each record after the registry row it was read from.' },
      ],
    },
    { title: 'Description', fields: [{ key: 'description', label: 'What it does', raw: 'desc', value: startup.description && <span dir="auto">{decode(startup.description)}</span> }] },
    { title: 'People', fields: [{ key: 'founders', label: 'Founders', raw: 'founders', value: startup.founders.length ? startup.founders.join(', ') : null }] },
    {
      title: 'Condition',
      fields: [
        { key: 'website', label: 'Website', raw: 'website', value: site && <a href={startup.website ?? undefined} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 break-all">{site}<ArrowUpRight className="size-3.5 shrink-0" aria-hidden /></a> },
        { key: 'reachable', label: 'Reachable', value: <span className="text-ink-2">Not checked yet</span>, derived: 'Athar has not checked this website yet. A check records what it saw and when, never a verdict.' },
      ],
    },
  ]
  const all = groups.flatMap((g) => g.fields)
  const [active, setActive] = useState<string>('description')
  const field = all.find((f) => f.key === active) ?? all[0]

  return (
    <article className="@container">
      <header className="flex flex-wrap items-end gap-x-6 gap-y-4 border-b border-hairline pb-6">
        <TileMark id={startup.id} sector={startup.sector} size={56} />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 font-mono text-sm text-ink-2">
            {catalogueNo(row)}
            {row !== undefined && <CopyButton value={catalogueNo(row)} label="Copy number" className="text-xs" />}
          </p>
          <h1 className="mt-1 text-[2.25rem] leading-[2.5rem] @[56rem]:text-[2.75rem] @[56rem]:leading-[3rem]">{startup.name}</h1>
        </div>
        <Link to="/" search={{ draft: startup.description ?? startup.name }} className="inline-flex h-10 items-center rounded-full bg-glaze px-4 text-sm font-medium text-glaze-ink no-underline hover:bg-glaze-hover">
          Check an idea against it
        </Link>
      </header>

      <div className="grid gap-x-10 @[52rem]:grid-cols-[minmax(0,1fr)_17rem]">
        <MarkerText as="div" className="min-w-0">
          {groups.map((g) => (
            <section key={g.title} aria-labelledby={`g-${g.title}`} className="border-b border-hairline py-5 last:border-b-0">
              <h2 id={`g-${g.title}`} className="mb-2 font-sans text-sm font-medium text-ink-2">
                {g.title}
              </h2>
              <dl className="m-0">
                {g.fields.map((f) => {
                  const missing = f.value === null || f.value === undefined || f.value === ''
                  const on = f.key === field.key
                  return (
                    <div key={f.key} className={cn('grid grid-cols-[8.5rem_minmax(0,1fr)_auto] items-baseline gap-x-4 border-s-2 py-2.5 ps-3', on ? 'border-glaze bg-surface' : 'border-transparent')}>
                      <dt className="text-sm text-ink-2">{f.label}</dt>
                      <dd className={cn('m-0 min-w-0', f.key === 'description' && 'font-display text-xl leading-8')}>
                        {missing ? (
                          <Mark type="circle" color="var(--ochre)">
                            <span className="text-ink-2">The registry doesn&apos;t say.</span>
                          </Mark>
                        ) : (
                          f.value
                        )}
                      </dd>
                      <dd className="m-0">
                        <button
                          type="button"
                          onClick={() => setActive(f.key)}
                          aria-pressed={on}
                          aria-label={`Where ${f.label.toLowerCase()} comes from`}
                          title="Where this comes from"
                          className="grid size-7 place-content-center rounded-full hover:bg-surface-raised"
                        >
                          <span aria-hidden className={cn('block size-2.5 rotate-45', on ? 'bg-ochre' : missing ? 'border border-dashed border-control' : 'bg-ochre/55')} />
                        </button>
                      </dd>
                    </div>
                  )
                })}
              </dl>
            </section>
          ))}
        </MarkerText>

        <aside aria-label="Chain and neighbours" className="grid content-start gap-8 border-hairline py-5 @[52rem]:sticky @[52rem]:top-20 @[52rem]:self-start @[52rem]:border-s @[52rem]:ps-8">
          <ChainRail field={field} raw={raw} chain={chain} row={row} />
          {operator && startup.primary_row_id && (
            <Link to="/portal/trace/$rowId" params={{ rowId: startup.primary_row_id }} className="-mt-4 text-sm">
              Open the full trace
            </Link>
          )}
          {neighbours.length > 0 && (
            <section aria-labelledby="near-h">
              <h2 id="near-h" className="font-sans text-sm font-medium text-ink-2">
                Nearest records
              </h2>
              <p className="text-xs text-ink-2">Same sector, closest labelling year</p>
              <ul className="mt-2 border-t border-hairline">
                {neighbours.map((n) => (
                  <li key={n.id} className="border-b border-hairline">
                    <Link to="/startups/$id" params={{ id: n.id }} className="grid grid-cols-[1.25rem_minmax(0,1fr)_auto] items-center gap-2.5 py-2.5 no-underline hover:bg-surface">
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

/** The chain for one value, as stops on a rail: registry snapshot, the row as downloaded, cleaning, this record. */
function ChainRail({ field, raw, chain, row }: { field: Field; raw: Record<string, unknown>; chain: ProfileData['chain']; row: number | undefined }) {
  const change = chain?.changes.find((c) => c.field === field.key)
  const original = field.raw ? show(raw[field.raw]) : null
  const missing = field.value === null || field.value === undefined || field.value === ''
  const stops: { title: string; body: React.ReactNode; muted?: boolean }[] = field.derived
    ? [
        { title: 'Startup Tunisia registry', body: chain ? `Snapshot of ${longDate(chain.fetchedAt)}` : 'Not collected yet' },
        { title: `Row ${row ?? '—'}`, body: 'The row this record was read from' },
        { title: 'Athar', body: field.derived },
      ]
    : [
        { title: 'Startup Tunisia registry', body: chain ? `Snapshot of ${longDate(chain.fetchedAt)}, ${chain.snapshot}` : 'Not collected yet' },
        {
          title: `Row ${row ?? '—'}, as downloaded`,
          body: original ? <span dir="auto" className="line-clamp-6 break-words">“{original}”</span> : 'Empty in the row',
          muted: !original,
        },
        { title: 'Cleaning', body: change ? change.why : missing ? 'Nothing to clean' : 'Kept exactly as written' },
        { title: 'This record', body: missing ? 'Shown as missing, not guessed' : 'The value you see' },
      ]
  return (
    <section aria-labelledby="chain-h">
      <h2 id="chain-h" className="font-sans text-sm font-medium text-ink-2">
        Where “{field.label.toLowerCase()}” comes from
      </h2>
      <ol className="relative mt-4 grid gap-5 ps-6 before:absolute before:inset-y-1.5 before:start-[5px] before:w-px before:bg-ochre">
        {stops.map((s, i) => (
          <li key={s.title} className="relative grid gap-0.5">
            <span aria-hidden className={cn('absolute -start-6 top-1.5 size-[11px] rounded-full border-2 border-ochre', i === stops.length - 1 ? 'bg-ochre' : 'bg-canvas', s.muted && 'border-dashed border-control')} />
            <span className="text-sm font-medium">{s.title}</span>
            <span className={cn('text-sm', s.muted ? 'text-ink-2 italic' : 'text-ink-2')}>{s.body}</span>
          </li>
        ))}
      </ol>
    </section>
  )
}
