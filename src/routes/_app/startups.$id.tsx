import { Link, createFileRoute, notFound } from '@tanstack/react-router'
import { ChevronDown } from 'lucide-react'
import { useState } from 'react'

import { Mark, MarkerText } from '@/components/kokonutui/marker-text'
import { cn } from '@/lib/utils'
import { getStartup } from '#/server/api/app'

export const Route = createFileRoute('/_app/startups/$id')({
  loader: async ({ params }) => {
    const result = await getStartup({ data: params.id })
    if (!result) throw notFound()
    return result
  },
  component: CatalogueRecord,
})

const date = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

type Field = { label: string; key: string; value: React.ReactNode }

// A startup as an accession record: what the registry says, and the chain behind each line.
function CatalogueRecord() {
  const { startup, sources, chain } = Route.useLoaderData()
  const fields: Field[] = [
    { label: 'What it does', key: 'desc', value: startup.description },
    { label: 'Sector', key: 'sector', value: startup.sector },
    { label: 'Website', key: 'website', value: startup.website && <a href={startup.website}>{startup.website.replace(/^https?:\/\//, '')}</a> },
    { label: 'Founders', key: 'founders', value: startup.founders.length ? startup.founders.join(', ') : null },
    { label: 'Labelled', key: 'label', value: startup.cohort },
    { label: 'Founded', key: 'creation_year', value: startup.creation_year },
  ]

  return (
    <main className="mx-auto grid max-w-4xl gap-10 px-6 py-10">
      <Link to="/search" className="text-sm">
        Back to the archive
      </Link>

      <header className="grid gap-3">
        <p className="font-mono text-xs text-ink-2">
          {['ATH-' + startup.id.slice(-6).toUpperCase(), chain && `Registry row ${chain.rowNumber}`, chain && `Collected ${date(chain.fetchedAt)}`].filter(Boolean).join(' · ')}
        </p>
        <h1 className="text-4xl font-semibold text-balance">{startup.name}</h1>
      </header>

      <MarkerText as="dl" className="grid divide-y divide-hairline border-y border-hairline">
        {fields.map((f) => (
          <FieldRow key={f.key} field={f} chain={chain} />
        ))}
      </MarkerText>

      <section className="grid gap-3">
        <h2 className="text-lg font-semibold">Where this record was found</h2>
        <ul className="grid gap-3">
          {sources.map((s) => (
            <li key={s.source_row_id} className="bg-surface p-4">
              <details>
                <summary className="cursor-pointer text-sm">
                  Startup Tunisia registry, row {s.row_number}, collected {date(s.fetched_at)}
                </summary>
                <pre className="mt-3 overflow-x-auto font-mono text-xs leading-5 whitespace-pre-wrap text-ink-2">{JSON.stringify(JSON.parse(s.raw_json), null, 2)}</pre>
              </details>
            </li>
          ))}
        </ul>
        {sources.length > 1 && <p className="text-sm text-ink-2">The registry lists this company {sources.length} times; Athar keeps one record and every row behind it.</p>}
      </section>

      <section className="grid gap-2">
        <h2 className="text-lg font-semibold">Similar startups</h2>
        <p className="text-sm text-ink-2">Not catalogued yet: similarity appears once the lab has embedded the archive.</p>
      </section>
    </main>
  )
}

// One line of the record. The chain shows where the value came from and what cleaning changed.
function FieldRow({ field, chain }: { field: Field; chain: { rowNumber: number; snapshot: string; changes: { field: string; why: string }[] } | null }) {
  const [open, setOpen] = useState(false)
  const change = chain?.changes.find((c) => c.field === field.key)
  const missing = field.value === null || field.value === undefined || field.value === ''

  return (
    <div className="grid gap-1 py-4 sm:grid-cols-[10rem_1fr] sm:gap-6">
      <dt className="text-sm text-ink-2">{field.label}</dt>
      <dd className="m-0 grid gap-2">
        <div className="flex items-start justify-between gap-4">
          <span className="min-w-0">
            {missing ? (
              <Mark type="circle" color="var(--ochre)">
                <span className="text-ink-2">The registry doesn&apos;t say</span>
              </Mark>
            ) : (
              field.value
            )}
          </span>
          {chain && (
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              aria-expanded={open}
              className="flex shrink-0 items-center gap-1 font-mono text-[0.6875rem] text-ink-2 hover:text-ink"
            >
              Chain <ChevronDown className={cn('size-3 transition-transform duration-150', open && 'rotate-180')} />
            </button>
          )}
        </div>
        {open && chain && (
          <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[0.6875rem] text-ink-2">
            <li>Startup Tunisia registry</li>
            <li aria-hidden>→</li>
            <li>snapshot {chain.snapshot}</li>
            <li aria-hidden>→</li>
            <li>row {chain.rowNumber}</li>
            <li aria-hidden>→</li>
            <li className="text-ochre-text">field {field.key}</li>
            {change && (
              <>
                <li aria-hidden>→</li>
                <li>cleaned: {change.why.toLowerCase()}</li>
              </>
            )}
          </ol>
        )}
      </dd>
    </div>
  )
}
