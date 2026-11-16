import { Link } from '@tanstack/react-router'
import { ArrowUpRight } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { Change, getStartup } from '#/server/api/app'

export type ProfileData = NonNullable<Awaited<ReturnType<typeof getStartup>>>

export const longDate = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
export const yearOf = (cohort: string | null) => (cohort ? cohort.slice(3) : null)

// Registry keys behind each profile field, so the excerpt can quote the row as downloaded.
const RAW: Record<string, string> = { description: 'desc', sector: 'sector', website: 'website', founders: 'founders', cohort: 'label', creation_year: 'creation_year' }

const LANG = (t: string) => (/[؀-ۿ]/.test(t) ? 'ar' : /\b(le|la|les|des|une|est|pour|avec|qui)\b/i.test(t) ? 'fr' : 'en')
const LANG_NAME = { ar: 'Arabic', fr: 'French', en: 'English' } as const

type Field = { key: string; label: string; value: React.ReactNode; missing: string }

/**
 * A startup as the registry describes it. Each line sits on the ochre rail; its source opens in
 * place with the row as downloaded and what cleaning changed. A missing line breaks the rail.
 */
export function Profile({ data, compact, operator }: { data: ProfileData; compact?: boolean; operator?: boolean }) {
  const { startup, sources, chain, neighbours } = data
  const raw = sources[0] ? (JSON.parse(sources[0].raw_json) as Record<string, unknown>) : {}
  const rows = sources.map((s) => s.row_number)
  const rowsLabel = rows.length > 1 ? `rows ${rows.join(', ')}` : `row ${rows[0]}`
  const site = startup.website?.replace(/^https?:\/\//, '').replace(/\/$/, '')

  const fields: Field[] = [
    { key: 'description', label: 'Description', value: startup.description, missing: 'Not in the registry. The row leaves the description empty.' },
    { key: 'sector', label: 'Sector', value: startup.sector, missing: 'Not in the registry.' },
    { key: 'website', label: 'Website', value: site && <a href={startup.website ?? undefined} target="_blank" rel="noreferrer">{site}</a>, missing: 'Not in the registry, or the address could not be read.' },
    { key: 'founders', label: 'Founders', value: startup.founders.length ? startup.founders.join(', ') : null, missing: 'Not in the registry. The row leaves this field empty.' },
    { key: 'cohort', label: 'Labelled', value: startup.cohort, missing: 'Not in the registry.' },
    { key: 'creation_year', label: 'Created', value: startup.creation_year, missing: 'Not in the registry.' },
  ]

  return (
    <article className={cn('grid gap-x-16 xl:grid-cols-[minmax(0,1fr)_20rem]', compact ? 'px-6 py-8 lg:px-10' : 'px-4 py-8 sm:px-8 lg:px-12 lg:py-10')}>
      <header className="flex flex-wrap items-end justify-between gap-6 border-b border-hairline pb-6 xl:col-span-2">
        <div className="min-w-0">
          <h1 className="text-[1.75rem] leading-9">{startup.name}</h1>
          <p className="mt-1.5 text-sm text-ink-2">
            {[startup.sector, startup.creation_year && `created ${startup.creation_year}`, yearOf(startup.cohort) && `labelled ${yearOf(startup.cohort)}`, `from registry ${rowsLabel}`].filter(Boolean).join(' · ')}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" className="h-10 rounded-[4px] px-4">
            <Link to="/idea" search={{ draft: startup.description ?? '' }} className="text-ink no-underline">
              Check an idea against it
            </Link>
          </Button>
          {startup.website && (
            <Button asChild variant="outline" className="h-10 rounded-[4px] px-4">
              <a href={startup.website} target="_blank" rel="noreferrer" className="text-ink no-underline">
                Visit website <ArrowUpRight />
              </a>
            </Button>
          )}
        </div>
      </header>

      <section aria-labelledby="facts-h" className="min-w-0">
        <h2 id="facts-h" className="mt-6 mb-2 text-xl">What the registry says</h2>
        <ol className="m-0 list-none p-0">
          {fields.map((f, i) => (
            <FieldLine
              key={f.key}
              field={f}
              first={i === 0}
              last={i === fields.length - 1}
              original={text(raw[RAW[f.key]])}
              change={chain?.changes.find((c) => c.field === f.key)}
              rowsLabel={rowsLabel}
              rowNumber={chain?.rowNumber}
              snapshot={chain ? longDate(chain.fetchedAt) : null}
              rowId={operator ? startup.primary_row_id : null}
            />
          ))}
        </ol>
        {chain && chain.changes.some((c) => !RAW[c.field]) && (
          <p className="mt-4 max-w-[62ch] text-[0.8125rem] leading-[1.125rem] text-ink-2">
            Cleaning also dropped {chain.changes.filter((c) => !RAW[c.field]).map((c) => `${c.field} (${c.why.toLowerCase()})`).join(' and ')}.
          </p>
        )}
      </section>

      <aside aria-labelledby="near-h" className="mt-10 self-start xl:mt-0">
        <h2 id="near-h" className="mt-6 mb-1 text-xl">Near it in the registry</h2>
        <p className="mb-3 text-[0.8125rem] leading-[1.125rem] text-ink-2">Same sector, closest labelling year. Similar startups by meaning appear once the archive is indexed.</p>
        {neighbours.length === 0 ? (
          <p className="border-t border-control pt-4 text-sm text-ink-2">No other startup in this sector.</p>
        ) : (
          <ul className="m-0 list-none border-t border-control p-0">
            {neighbours.map((n) => (
              <li key={n.id} className="grid gap-0.5 border-b border-hairline py-3.5">
                <Link to="/startups/$id" params={{ id: n.id }} className="font-display font-medium text-ink no-underline hover:text-glaze hover:underline">
                  {n.name}
                </Link>
                <span className="line-clamp-2 text-sm text-ink-2">{n.description ?? 'No description in the registry.'}</span>
                <span className="text-[0.8125rem] text-ink-2">
                  {[n.creation_year && `created ${n.creation_year}`, yearOf(n.cohort) && `labelled ${yearOf(n.cohort)}`].filter(Boolean).join(' · ')}
                </span>
              </li>
            ))}
          </ul>
        )}
      </aside>
    </article>
  )
}

const text = (v: unknown) => (v === null || v === undefined || v === '' ? null : Array.isArray(v) ? v.join(', ') : String(v))

function FieldLine({ field, first, last, original, change, rowsLabel, rowNumber, snapshot, rowId }: { field: Field; first: boolean; last: boolean; original: string | null; change?: Change; rowsLabel: string; rowNumber?: number; snapshot: string | null; rowId: string | null }) {
  const [open, setOpen] = useState(false)
  const gap = field.value === null || field.value === undefined || field.value === ''
  const lang = original ? LANG(original) : 'en'

  return (
    <li className="grid grid-cols-[1.75rem_minmax(0,1fr)] gap-x-3 sm:grid-cols-[1.75rem_8rem_minmax(0,1fr)]">
      <span aria-hidden className="relative">
        <span
          className={cn(
            'absolute start-[13px] w-0.5',
            first ? 'top-[22px]' : 'top-0',
            last ? 'h-[22px]' : 'bottom-0',
            gap ? 'border-s-2 border-dashed border-control' : 'bg-ochre',
          )}
        />
        <span
          className={cn(
            'absolute start-[9px] top-[17px] size-2.5 rounded-full transition-shadow duration-150',
            gap ? 'bg-canvas shadow-[inset_0_0_0_2px_var(--control)]' : 'bg-ochre',
            open && 'shadow-[0_0_0_3px_var(--canvas),0_0_0_5px_var(--ochre)]',
          )}
        />
      </span>
      <span className="pt-3.5 text-sm text-ink-2 sm:py-3.5">{field.label}</span>
      <div className={cn('col-start-2 pt-1 pb-4 sm:col-start-3 sm:pt-3', !last && 'border-b border-hairline')}>
        {gap ? (
          <p className="max-w-[62ch] text-ink-2">{field.missing}</p>
        ) : (
          <>
            <div className="max-w-[62ch]" lang={field.key === 'description' ? lang : undefined}>
              {field.value}
            </div>
            <p className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[0.8125rem] leading-[1.125rem]">
              <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="text-glaze underline decoration-1 underline-offset-[3px] hover:decoration-2">
                {open ? 'Hide source' : `Source · ${rowsLabel}`}
              </button>
              {field.key === 'website' && <span className="text-ink-2">Website not checked yet</span>}
              {change && !open && <span className="text-ink-2">Cleaned: {change.why.toLowerCase()}</span>}
            </p>
            {open && !change && (
              <p role="region" aria-label={`Original source for ${field.label.toLowerCase()}`} className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[0.8125rem] leading-[1.125rem] text-ink-2">
                <span>
                  <span className="text-ochre-text">Same as the registry text</span>, row {rowNumber}
                  {snapshot && ` · snapshot ${snapshot}`}
                  {original && original !== String(field.value ?? '') && field.key !== 'description' && ` · written there as “${original}”`}
                </span>
                {rowId && (
                  <Link to="/portal/trace/$rowId" params={{ rowId }} className="text-glaze">
                    See how row {rowNumber} was cleaned
                  </Link>
                )}
              </p>
            )}
            {open && change && (
              <div role="region" aria-label={`Original source for ${field.label.toLowerCase()}`} className="mt-3 max-w-[66ch] bg-surface px-5 py-4">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.8125rem] leading-[1.125rem] text-ink-2">
                  <span className="font-medium text-ochre-text">Original{field.key === 'description' ? `, ${LANG_NAME[lang]}` : ''}</span>
                  <span>
                    Startup Tunisia registry · row {rowNumber}
                    {snapshot && ` · snapshot ${snapshot}`}
                  </span>
                </div>
                <blockquote lang={lang} dir="auto" className={cn('mt-2.5 mb-0', lang === 'ar' && 'font-[Noto_Naskh_Arabic] text-lg leading-8')}>
                  {change && change.from !== null ? (
                    <>
                      <del className="text-ink-2 decoration-ink-2">{change.from}</del>
                      {change.to && <> → {change.to}</>}
                    </>
                  ) : (
                    (original ?? <span className="text-ink-2">Empty in the row.</span>)
                  )}
                </blockquote>
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[0.8125rem] leading-[1.125rem]">
                  {change ? (
                    <span className="text-ink-2">
                      <del>Struck text</del> is the row as downloaded; cleaning changed it: {change.why.toLowerCase()}.
                    </span>
                  ) : (
                    <span className="text-ink-2">Shown exactly as downloaded.</span>
                  )}
                  {rowId && (
                    <Link to="/portal/trace/$rowId" params={{ rowId }} className="text-glaze">
                      See how row {rowNumber} was cleaned
                    </Link>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </li>
  )
}
