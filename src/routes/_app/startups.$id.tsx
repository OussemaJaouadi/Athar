import { Link, createFileRoute, notFound } from '@tanstack/react-router'
import { ArrowUpRight, Lightbulb } from 'lucide-react'

import { ChainStrip, Panel, SampleTag, Score, catalogueNo, labelledYear, shortDate } from '@/components/athar/kit'
import { Mark, MarkerText } from '@/components/kokonutui/marker-text'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { getStartup } from '#/server/api/app'
import { getProfileSample, type WebsiteCheck } from '#/server/api/sample'

export const Route = createFileRoute('/_app/startups/$id')({
  loader: async ({ params }) => {
    const [record, sample] = await Promise.all([getStartup({ data: params.id }), getProfileSample({ data: params.id })])
    if (!record) throw notFound()
    return { ...record, sample }
  },
  component: AccessionRecord,
})

// A startup as an accession record: every line with its chain, its condition, and its neighbours.
function AccessionRecord() {
  const { startup, sources, chain, reviews, sample } = Route.useLoaderData()
  const website = startup.website?.replace(/^https?:\/\//, '').replace(/\/$/, '')
  const fields: { label: string; key: string; value: React.ReactNode }[] = [
    { label: 'What it does', key: 'description', value: startup.description },
    { label: 'Sector', key: 'sector', value: startup.sector && <Link to="/search" search={{ sector: startup.sector }}>{startup.sector}</Link> },
    { label: 'Website', key: 'website', value: website && <a href={startup.website ?? undefined} target="_blank" rel="noreferrer">{website}</a> },
    { label: 'Founders', key: 'founders', value: startup.founders.length ? startup.founders.join(', ') : null },
    { label: 'Labelled', key: 'cohort', value: startup.cohort },
    { label: 'Founded', key: 'creation_year', value: startup.creation_year },
  ]

  return (
    <main className="grid grid-cols-[minmax(0,1fr)] gap-5 px-4 py-5 sm:px-6 lg:px-8">
      <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1.5 text-xs text-ink-2">
        <Link to="/search" className="text-ink-2">Archive</Link>
        <span aria-hidden>/</span>
        {startup.sector && (
          <>
            <Link to="/search" search={{ sector: startup.sector }} className="text-ink-2">{startup.sector}</Link>
            <span aria-hidden>/</span>
          </>
        )}
        <span className="text-ink">{startup.name}</span>
      </nav>

      <header className="grid gap-4 border border-hairline bg-canvas p-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
        <div className="grid gap-2">
          <p className="font-mono text-[0.6875rem] tracking-wide text-ink-2 uppercase">
            Accession {catalogueNo(startup.id)} · {startup.sector ?? 'no sector'}
          </p>
          <h1 className="text-3xl font-semibold sm:text-4xl">{startup.name}</h1>
          <p className="max-w-3xl text-ink-2">{startup.description ?? 'The registry lists this startup without a description.'}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {startup.website && (
            <Button asChild variant="outline">
              <a href={startup.website} target="_blank" rel="noreferrer" className="no-underline">
                Visit website <ArrowUpRight />
              </a>
            </Button>
          )}
          <Button asChild>
            <Link to="/idea" search={{ draft: startup.description ?? startup.name }} className="no-underline">
              <Lightbulb /> Check an idea like this
            </Link>
          </Button>
        </div>
        <dl className="grid grid-cols-2 gap-px border border-hairline bg-hairline sm:grid-cols-4 md:col-span-2">
          {[
            ['Registry row', chain ? `#${chain.rowNumber}` : '—'],
            ['Collected', chain ? shortDate(chain.fetchedAt) : '—'],
            ['Labelled', labelledYear(startup.cohort) ?? '—'],
            ['Rows behind it', String(sources.length)],
          ].map(([k, v]) => (
            <div key={k} className="bg-surface px-3 py-2">
              <dt className="font-mono text-[0.625rem] tracking-wide text-ink-2 uppercase">{k}</dt>
              <dd className="m-0 font-mono text-sm tabular-nums">{v}</dd>
            </div>
          ))}
        </dl>
      </header>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="grid gap-5">
          <Panel title="The record, line by line" meta="each value shows where it came from" bodyClassName="p-0">
            <MarkerText as="dl" className="divide-y divide-hairline">
              {fields.map((f) => {
                const missing = f.value === null || f.value === undefined || f.value === ''
                return (
                  <div key={f.key} className="grid gap-x-6 gap-y-1.5 px-4 py-3.5 md:grid-cols-[9rem_minmax(0,1fr)]">
                    <dt className="text-sm text-ink-2">{f.label}</dt>
                    <dd className="m-0 min-w-0">
                      {missing ? (
                        <Mark type="circle" color="var(--ochre)">
                          <span className="text-ink-2">The registry doesn&apos;t say</span>
                        </Mark>
                      ) : (
                        f.value
                      )}
                    </dd>
                    <ChainStrip chain={chain} field={f.key} className="md:col-start-2" />
                  </div>
                )
              })}
            </MarkerText>
            {chain && chain.changes.length > 0 && (
              <div className="grid gap-1 border-t border-hairline bg-surface px-4 py-3 text-sm">
                <span className="font-mono text-[0.625rem] tracking-wide text-ink-2 uppercase">What cleaning changed</span>
                {chain.changes.map((c) => (
                  <p key={c.field}>
                    <span className="font-mono text-xs text-ochre-text">{c.field}</span> <span className="text-ink-2">· {c.why}</span>
                  </p>
                ))}
              </div>
            )}
          </Panel>

          <Panel title="Where it was found" meta={`${sources.length} registry row${sources.length > 1 ? 's' : ''}`} bodyClassName="p-0">
            <ul className="divide-y divide-hairline">
              {sources.map((s) => (
                <li key={s.source_row_id}>
                  <details className="group">
                    <summary className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3 text-sm">
                      <span>
                        Startup Tunisia registry · row <span className="font-mono">{s.row_number}</span> · collected {shortDate(s.fetched_at)}
                      </span>
                      <span className="font-mono text-[0.6875rem] text-ink-2 group-open:hidden">show as downloaded</span>
                    </summary>
                    <pre className="mx-4 mb-4 overflow-x-auto bg-surface p-3 font-mono text-xs leading-5 whitespace-pre-wrap text-ink-2">{JSON.stringify(JSON.parse(s.raw_json), null, 2)}</pre>
                  </details>
                </li>
              ))}
            </ul>
            {sources.length > 1 && <p className="border-t border-hairline px-4 py-3 text-xs text-ink-2">The registry lists this company {sources.length} times; Athar keeps one record and every row behind it.</p>}
          </Panel>

          {reviews.length > 0 && (
            <Panel title="Open questions about this record">
              <ul className="grid gap-1 text-sm">
                {reviews.map((r, i) => (
                  <li key={i}>
                    <span className="font-mono text-xs text-ochre-text">{r.code}</span> <span className="text-ink-2">· {r.message}</span>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>

        <div className="grid gap-5">
          <Panel title="Condition" meta={<SampleTag />}>
            {sample?.website ? <Condition {...sample.website} /> : <p className="text-sm text-ink-2">No website in the registry, so there is nothing to check.</p>}
          </Panel>

          <Panel title="Closest in the archive" meta={<SampleTag />} bodyClassName="p-0">
            <ol className="divide-y divide-hairline">
              {sample?.similar.map((s) => (
                <li key={s.id} className="grid grid-cols-[minmax(0,1fr)] gap-0.5 px-4 py-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <Link to="/startups/$id" params={{ id: s.id }} className="truncate text-sm font-medium">
                      {s.name}
                    </Link>
                    <Score value={s.score} />
                  </div>
                  <p className="truncate text-xs text-ink-2">
                    {s.sector} · {labelledYear(s.cohort)} {s.description ? `· ${s.description}` : ''}
                  </p>
                </li>
              ))}
            </ol>
          </Panel>

          {sample && sample.themes.length > 0 && (
            <Panel title="Themes" meta={<SampleTag />}>
              <div className="flex flex-wrap gap-1.5">
                {sample.themes.map((t) => (
                  <Link key={t.id} to="/themes" search={{ theme: t.id }} className="rounded-sm border border-hairline px-2 py-1 text-xs no-underline hover:bg-surface">
                    {t.name}
                  </Link>
                ))}
              </div>
            </Panel>
          )}
        </div>
      </div>
    </main>
  )
}

const TONE: Record<WebsiteCheck['status'], string> = { up: 'bg-glaze', moved: 'bg-ochre', down: 'bg-destructive' }
const WORD: Record<WebsiteCheck['status'], string> = { up: 'Reachable', moved: 'Redirects elsewhere', down: 'Not reachable' }

function Condition({ current, since, checks }: { current: WebsiteCheck['status']; since: string; checks: WebsiteCheck[] }) {
  return (
    <div className="grid gap-3">
      <p className="flex items-center gap-2 text-sm">
        <span className={cn('size-2 rounded-full', TONE[current])} aria-hidden />
        <span className="font-medium">{WORD[current]}</span>
        <span className="text-ink-2">since {shortDate(since)}</span>
      </p>
      <div className="grid gap-1">
        <div className="flex h-7 items-end gap-[3px]" role="img" aria-label={`Last ${checks.length} weekly checks`}>
          {checks.map((c) => (
            <span key={c.at} title={`${shortDate(c.at)}: ${WORD[c.status]}${c.ms ? ` · ${c.ms} ms` : ''}`} className={cn('flex-1', TONE[c.status], c.status === 'up' ? 'h-full opacity-70' : 'h-full')} />
          ))}
        </div>
        <div className="flex justify-between font-mono text-[0.625rem] text-ink-2">
          <span>{shortDate(checks[0].at)}</span>
          <span>weekly checks</span>
          <span>today</span>
        </div>
      </div>
    </div>
  )
}
