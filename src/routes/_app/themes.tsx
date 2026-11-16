import { Link, createFileRoute, getRouteApi } from '@tanstack/react-router'
import { useMemo, useState } from 'react'

import { yearOf } from '@/components/athar/profile'
import { TileMark, sectorStyle } from '@/components/athar/tile-mark'
import { cn } from '@/lib/utils'
import { getTheme, getThemes } from '#/server/api/sample'

type Search = { theme?: string }
const shell = getRouteApi('/_app')

export const Route = createFileRoute('/_app/themes')({
  validateSearch: (s: Record<string, unknown>): Search => ({ theme: typeof s.theme === 'string' ? s.theme : undefined }),
  loaderDeps: ({ search }) => search,
  loader: async ({ deps }) => ({ ...(await getThemes()), selected: deps.theme ? await getTheme({ data: deps.theme }) : null }),
  component: ThemesPage,
})

const decode = (t: string) => t.replace(/&amp;/g, '&').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"')

// Themes: the registry as one wall. An index of themes and gaps lights the startups each one covers.
function ThemesPage() {
  const { themes, gaps, selected } = Route.useLoaderData()
  const { wall } = shell.useLoaderData()
  const [hover, setHover] = useState<string | null>(null)

  const membersOf = useMemo(() => new Map([...themes, ...gaps].map((t) => [t.id, new Set(t.ids)])), [themes, gaps])
  const sectors = useMemo(() => {
    const by = new Map<string, typeof wall>()
    for (const t of wall) by.set(t.sector ?? 'No sector', [...(by.get(t.sector ?? 'No sector') ?? []), t])
    return [...by.entries()].sort((a, b) => b[1].length - a[1].length)
  }, [wall])

  const focus = hover ?? selected?.id ?? null
  const lit = focus ? membersOf.get(focus) : undefined
  const focusName = [...themes, ...gaps].find((t) => t.id === focus)?.name

  return (
    <main className="grid flex-1 grid-cols-1 gap-x-12 px-4 py-10 sm:px-8 xl:grid-cols-12">
      <section aria-labelledby="index-h" className="xl:col-span-4">
        <h1 className="text-[2.75rem] leading-[3rem]">Themes</h1>
        <p className="mt-2 text-ink-2">What the {wall.length} registered startups work on, by the words they use.</p>

        <h2 id="index-h" className="mt-10 border-b border-hairline pb-2 font-sans text-sm font-medium text-ink-2">
          Most tried
        </h2>
        <ol onMouseLeave={() => setHover(null)}>
          {themes.map((t, i) => (
            <IndexRow key={t.id} n={i + 1} id={t.id} name={t.name} count={t.count} active={selected?.id === t.id} onHover={setHover} />
          ))}
        </ol>

        <h2 className="mt-10 border-b border-hairline pb-2 font-sans text-sm font-medium text-ink-2">Least tried</h2>
        <ol onMouseLeave={() => setHover(null)}>
          {gaps.map((g, i) => (
            <IndexRow key={g.id} n={themes.length + i + 1} id={g.id} name={g.name} count={g.count} gap active={selected?.id === g.id} onHover={setHover} />
          ))}
        </ol>
      </section>

      <section aria-label="The registry as a wall" className="mt-12 xl:col-span-8 xl:mt-0">
        <div className="flex items-baseline justify-between gap-4 border-b border-hairline pb-2 text-sm">
          <span className="text-ink-2">{focusName ? <span className="text-ink">{focusName}</span> : 'Every startup in the registry, by sector'}</span>
          <span className="font-mono text-xs text-ink-2">{lit ? `${lit.size} of ${wall.length}` : wall.length}</span>
        </div>
        <div className="mt-5 grid gap-x-8 gap-y-4 sm:grid-cols-2">
          {sectors.map(([sector, tiles]) => {
            const glaze = sectorStyle(sector).glaze.fill
            const hits = lit ? tiles.filter((t) => lit.has(t.id)).length : 0
            return (
              <div key={sector} className="min-w-0">
                <div className="mb-1.5 flex items-baseline justify-between gap-3 text-xs">
                  <Link to="/search" search={{ sector }} className="truncate text-ink-2 no-underline hover:text-ink">
                    {sector}
                  </Link>
                  <span className="font-mono text-ink-2">{lit ? `${hits}/${tiles.length}` : tiles.length}</span>
                </div>
                <div className="flex flex-wrap gap-[3px]">
                  {tiles.map((t) => {
                    const on = !lit || lit.has(t.id)
                    return (
                      <Link
                        key={t.id}
                        to="/startups/$id"
                        params={{ id: t.id }}
                        title={t.name}
                        aria-label={t.name}
                        className={cn('size-3 transition-opacity duration-150', on ? 'opacity-100' : 'opacity-15', !t.described && 'outline outline-1 -outline-offset-1 outline-dashed outline-control')}
                        style={t.described ? { background: glaze } : undefined}
                      />
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>

        {selected && (
          <section aria-labelledby="sel-h" className="mt-12">
            <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-hairline pb-2">
              <h2 id="sel-h" className="text-[1.75rem] leading-9">
                {selected.name}
              </h2>
              <span className="text-sm text-ink-2">Descriptions using {selected.words.map((w) => `“${w}”`).join(', ')}</span>
            </div>
            {selected.members.length === 0 ? (
              <div className="mt-6 grid gap-4">
                <div className="flex gap-[3px]" aria-hidden>
                  {Array.from({ length: 24 }, (_, i) => (
                    <span key={i} className="size-3 outline outline-1 -outline-offset-1 outline-dashed outline-control" />
                  ))}
                </div>
                <p className="text-ink-2">The registry doesn&apos;t show anyone trying this.</p>
                <Link to="/" search={{ draft: selected.name }} className="w-fit text-sm">
                  Check it as an idea
                </Link>
              </div>
            ) : (
              <ul className="mt-1 grid gap-x-8 lg:grid-cols-2">
                {selected.members.map((m) => (
                  <li key={m.id} className="border-b border-hairline">
                    <Link to="/startups/$id" params={{ id: m.id }} className="grid grid-cols-[1.25rem_minmax(0,1fr)_auto] gap-x-3 gap-y-0.5 py-2.5 no-underline hover:bg-surface/60">
                      <TileMark id={m.id} sector={m.sector} size={20} className="mt-0.5" />
                      <span className="truncate text-sm font-medium text-ink">{m.name}</span>
                      <span className="font-mono text-xs text-ink-2">{yearOf(m.cohort)}</span>
                      <span className="col-start-2 col-end-4 truncate text-xs text-ink-2">{m.description ? decode(m.description) : 'The registry doesn’t say what it does.'}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {selected.gap && selected.members.length > 0 && (
              <Link to="/" search={{ draft: selected.name }} className="mt-4 inline-block text-sm">
                Check it as an idea
              </Link>
            )}
          </section>
        )}
      </section>
    </main>
  )
}

function IndexRow({ n, id, name, count, gap, active, onHover }: { n: number; id: string; name: string; count: number; gap?: boolean; active: boolean; onHover: (id: string) => void }) {
  return (
    <li className="border-b border-hairline">
      <Link
        to="/themes"
        search={active ? {} : { theme: id }}
        resetScroll={false}
        onMouseEnter={() => onHover(id)}
        onFocus={() => onHover(id)}
        aria-current={active ? 'true' : undefined}
        className={cn('grid h-11 grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-3 px-2 no-underline transition-colors duration-150', active ? 'bg-surface' : 'hover:bg-surface/60')}
      >
        <span className="font-mono text-xs text-ink-2">{String(n).padStart(2, '0')}</span>
        <span className="truncate text-[0.9375rem] text-ink">{name}</span>
        <span className={cn('font-mono text-sm', gap ? 'text-ochre-text' : 'text-ink-2')}>{count === 0 ? 'none' : count}</span>
      </Link>
    </li>
  )
}
