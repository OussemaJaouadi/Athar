import { Link, createFileRoute } from '@tanstack/react-router'
import { useReducedMotion } from 'motion/react'
import { useMemo, useState } from 'react'

import { yearOf } from '@/components/athar/profile'
import { TileMark } from '@/components/athar/tile-mark'
import { useAccordion, useAutoHeight } from '@/components/interior/accordion'
import { SegmentedControl } from '@/components/interior/segmented-control'
import { cn } from '@/lib/utils'
import { getAreas } from '#/server/api/areas'

type Search = { area?: string; order?: 'open' }

export const Route = createFileRoute('/_app/openings')({
  validateSearch: (s: Record<string, unknown>): Search => ({
    area: typeof s.area === 'string' ? s.area : undefined,
    order: s.order === 'open' ? 'open' : undefined,
  }),
  loader: () => getAreas(),
  component: OpeningsPage,
})

type Area = Awaited<ReturnType<typeof getAreas>>['areas'][number]
const decode = (t: string) => t.replace(/&amp;/g, '&').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"')

// Openings: where it is crowded and where nobody registered a startup, as one ranked list.
function OpeningsPage() {
  const { total, areas, inNone } = Route.useLoaderData()
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const openFirst = search.order === 'open'
  const ranked = useMemo(() => [...areas].sort((a, b) => (openFirst ? a.count - b.count : b.count - a.count) || a.name.localeCompare(b.name)), [areas, openFirst])
  const entries = useMemo(() => ranked.map(({ id }) => ({ id })), [ranked])
  const acc = useAccordion({
    items: entries,
    open: search.area ? [search.area] : [],
    onOpenChange: (open) => navigate({ search: (p) => ({ ...p, area: open[0] }), resetScroll: false, replace: true }),
  })
  const firstOpen = ranked.findIndex((a) => a.count <= 3)

  return (
    <main className="flex-1 px-4 py-10 sm:px-8">
      <header className="grid gap-6 border-b border-hairline pb-8 lg:grid-cols-12 lg:items-end">
        <div className="lg:col-span-8">
          <h1 className="text-[2.75rem] leading-[3rem]">Where is there room?</h1>
          <p className="mt-3 max-w-[64ch] text-ink-2">
            The {total} startups in the registry, grouped by what they do. A long row is crowded. Open tiles mean nobody registered one.
          </p>
        </div>
        <div className="lg:col-span-4 lg:justify-self-end">
          <SegmentedControl
            label="Order"
            options={[
              { value: 'tried', label: 'Most tried first' },
              { value: 'open', label: 'Open first' },
            ]}
            value={openFirst ? 'open' : 'tried'}
            onValueChange={(v) => navigate({ search: (p) => ({ ...p, order: v === 'open' ? 'open' : undefined }), resetScroll: false })}
            className="text-sm"
          />
        </div>
      </header>

      <ol>
        {ranked.map((a, i) => (
          <li key={a.id}>
            {!openFirst && i === firstOpen && (
              <p className="border-b border-hairline pt-8 pb-2 text-sm text-ink-2">Few or none</p>
            )}
            {openFirst && i === ranked.findIndex((x) => x.count > 3) && (
              <p className="border-b border-hairline pt-8 pb-2 text-sm text-ink-2">Already tried</p>
            )}
            <AreaRow area={a} acc={acc} />
          </li>
        ))}
        <li className="border-b border-hairline">
          <Link to="/search" className="grid min-h-14 items-center gap-x-8 py-3 no-underline hover:bg-surface/50 lg:grid-cols-12">
            <span className="text-base font-medium text-ink lg:col-span-4">In none of these groups</span>
            <span className="text-sm text-ink-2 lg:col-span-6">Their descriptions use none of these words, or there is no description.</span>
            <span className="font-mono text-sm text-ink lg:col-span-2 lg:text-end">{inNone}</span>
          </Link>
        </li>
      </ol>

      <p className="mt-6 max-w-[80ch] text-xs text-ink-2">
        Groups come from words shared in registry descriptions, so a startup can sit in more than one. “None in the registry” means no description uses these words, not that nobody tried.
      </p>
    </main>
  )
}

function AreaRow({ area: a, acc }: { area: Area; acc: ReturnType<typeof useAccordion> }) {
  const [hot, setHot] = useState(false)
  const open = acc.isOpen(a.id)
  const { ref, height } = useAutoHeight()
  const reduced = useReducedMotion()
  const empty = Math.max(0, 4 - a.count)

  return (
    <div className={cn('border-b border-hairline transition-colors duration-150', open && 'bg-surface/50')} onMouseEnter={() => setHot(true)} onMouseLeave={() => setHot(false)}>
      <div role="heading" aria-level={2}>
        <button {...acc.headerProps(a.id)} className="grid min-h-14 w-full items-center gap-x-8 gap-y-2 py-3 text-start lg:grid-cols-12">
          <span className="min-w-0 lg:col-span-4">
            <span className="block text-base font-medium text-ink">{a.name}</span>
            <span className="block truncate text-sm text-ink-2">{a.blurb}</span>
          </span>
          <span className="flex flex-wrap gap-[2px] lg:col-span-6" aria-hidden>
            {a.ids.map((id) => (
              <span key={id} className={cn('size-2 transition-colors duration-150', hot || open ? 'bg-ochre' : 'bg-control/70')} />
            ))}
            {Array.from({ length: empty }, (_, i) => (
              <span key={`e${i}`} className="size-2 outline outline-1 -outline-offset-1 outline-control" />
            ))}
          </span>
          <span className="lg:col-span-2 lg:text-end">
            <span className={cn('block font-mono text-sm', a.count <= 3 ? 'text-ochre-text' : 'text-ink')}>{a.count === 0 ? 'None in the registry' : a.count === 1 ? '1 startup' : `${a.count} startups`}</span>
            {a.busiest && <span className="block text-xs text-ink-2">{a.count > 1 ? `most in ${a.busiest}, latest ${a.latest}` : `in ${a.latest}`}</span>}
          </span>
        </button>
      </div>
      <div {...acc.panelProps(a.id)} style={{ height: open ? height : 0, transition: reduced ? 'none' : 'height 220ms cubic-bezier(0.2,0,0,1)' }} className="overflow-hidden">
        <div ref={ref} className="grid gap-x-8 pb-5 lg:grid-cols-12">
          <div className="lg:col-span-6 lg:col-start-5">
            {a.sample.length > 0 && (
              <ul className="border-t border-hairline">
                {a.sample.map((m) => (
                  <li key={m.id} className="border-b border-hairline">
                    <Link to="/startups/$id" params={{ id: m.id }} className="grid grid-cols-[1.25rem_minmax(0,1fr)_auto] gap-x-3 gap-y-0.5 py-2.5 no-underline hover:bg-surface">
                      <TileMark id={m.id} sector={m.sector} size={20} className="mt-0.5" />
                      <span className="truncate text-sm font-medium text-ink">{m.name}</span>
                      <span className="font-mono text-xs text-ink-2">{yearOf(m.cohort)}</span>
                      <span className="col-start-2 col-end-4 truncate text-xs text-ink-2">{m.description ? decode(m.description) : 'The registry doesn’t say what it does.'}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm">
              {a.count > 0 && (
                <Link to="/search" search={{ area: a.id }}>
                  See {a.count === 1 ? 'it' : `all ${a.count}`} in the Archive
                </Link>
              )}
              <Link to="/" search={{ draft: a.blurb }}>
                {a.count <= 3 ? 'Check it as an idea' : 'Check an idea here'}
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
