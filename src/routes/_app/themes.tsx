import { Link, createFileRoute, getRouteApi } from '@tanstack/react-router'
import { useMemo } from 'react'

import { yearOf } from '@/components/athar/profile'
import { Tile, TileStrip, useWallGroups } from '@/components/athar/tile-wall'
import { cn } from '@/lib/utils'
import { getTheme, getThemes } from '#/server/api/sample'

type Search = { theme?: string }
const shell = getRouteApi('/_app')

export const Route = createFileRoute('/_app/themes')({
  validateSearch: (s: Record<string, unknown>): Search => ({ theme: typeof s.theme === 'string' ? s.theme : undefined }),
  loaderDeps: ({ search }) => search,
  loader: async ({ deps }) => {
    const all = await getThemes()
    const id = deps.theme ?? all.themes[0]?.id
    return { ...all, selected: id ? await getTheme({ data: id }) : null }
  },
  component: ThemesPage,
})

// Themes: the registry as a wall, the word groups it falls into, and the gaps nobody filled.
function ThemesPage() {
  const { themes, gaps, selected } = Route.useLoaderData()
  const { wall } = shell.useLoaderData()
  const { sectors, min, max } = useWallGroups(wall)
  const byId = useMemo(() => new Map(wall.map((t) => [t.id, t])), [wall])
  const missing = wall.filter((t) => !t.described).length

  return (
    <div className="grid flex-1 xl:grid-cols-[minmax(0,1fr)_26rem]">
      <main className="min-w-0 px-4 py-10 sm:px-10 lg:px-16 lg:py-14">
        <h1 className="text-[1.75rem] leading-9">Themes</h1>
        <p className="mt-3 max-w-[64ch] text-ink-2">
          What the {wall.length} startups in the registry work on, and where nobody tried. These groups come from shared words in each description; groups by meaning come once the archive is indexed.
        </p>

        <section aria-labelledby="wall-h" className="mt-12">
          <h2 id="wall-h" className="text-xl">The registry as a wall</h2>
          <p className="mt-1 max-w-[64ch] text-sm text-ink-2">
            One tile per startup, by sector. Tiles fade the more recently a startup was labelled; the {missing} open tiles are startups the registry lists without a description.
          </p>
          <div className="mt-6 grid gap-x-10 gap-y-6 sm:grid-cols-2 2xl:grid-cols-3">
            {sectors.map(([sector, group]) => (
              <Link key={sector} to="/search" search={{ sector }} className="group grid content-start gap-2 no-underline">
                <span className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="text-ink group-hover:text-glaze group-hover:underline">{sector}</span>
                  <span className="text-ink-2">{group.length}</span>
                </span>
                <span className="flex flex-wrap gap-[3px]">
                  {group.map((t) => (
                    <Tile key={t.id} t={t} min={min} max={max} />
                  ))}
                </span>
              </Link>
            ))}
          </div>
        </section>

        <section aria-labelledby="themes-h" className="mt-16">
          <h2 id="themes-h" className="border-b border-control pb-2 text-xl">Word groups</h2>
          <ul className="m-0 list-none p-0">
            {themes.map((t) => {
              const busiest = [...t.years].sort((a, b) => b.count - a.count)[0]
              return (
                <li key={t.id} className={cn('grid gap-x-8 gap-y-2 border-b border-hairline py-4 md:grid-cols-[14rem_minmax(0,1fr)_auto] md:items-center', selected?.id === t.id && 'bg-surface')}>
                  <div className="md:ps-2">
                    <span className="font-display font-medium">{t.name}</span>
                    <p className="text-[0.8125rem] text-ink-2">
                      {t.count} startups{busiest && ` · most labelled in ${busiest.year}`}
                    </p>
                  </div>
                  <TileStrip linked={false} tiles={t.ids.slice(0, 90).map((id) => byId.get(id)).filter((x) => x !== undefined)} min={min} max={max} />
                  <Link to="/themes" search={{ theme: t.id }} resetScroll={false} className="text-sm whitespace-nowrap md:pe-2">
                    See the {t.count} startups
                  </Link>
                </li>
              )
            })}
          </ul>
        </section>

        <section aria-labelledby="gaps-h" className="mt-16">
          <h2 id="gaps-h" className="text-xl">Where few tried</h2>
          <p className="mt-1 max-w-[64ch] text-sm text-ink-2">Needs that sound obvious, and how many registry descriptions use their words. An open tile is a startup nobody registered.</p>
          <ul className="m-0 mt-4 list-none border-t border-control p-0">
            {gaps.map((g) => (
              <li key={g.id} className="grid gap-x-8 gap-y-2 border-b border-hairline py-4 md:grid-cols-[14rem_minmax(0,1fr)_auto] md:items-center">
                <div>
                  <span className="font-display font-medium">{g.name}</span>
                  <p className="text-[0.8125rem] text-ink-2">{g.count === 0 ? 'No startup in the registry' : g.count === 1 ? 'One startup' : `${g.count} startups`}</p>
                </div>
                <TileStrip linked={false} tiles={g.examples.map((e) => byId.get(e.id)).filter((x) => x !== undefined)} min={min} max={max} empty={Math.max(0, 10 - g.count)} />
                {g.count > 0 ? (
                  <Link to="/themes" search={{ theme: g.id }} resetScroll={false} className="text-sm whitespace-nowrap">
                    See {g.count === 1 ? 'it' : `the ${g.count}`}
                  </Link>
                ) : (
                  <Link to="/idea" search={{ draft: g.name }} className="text-sm whitespace-nowrap">
                    Check it as an idea
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </section>
      </main>

      <aside aria-label="Startups in the group" className="border-hairline xl:sticky xl:top-14 xl:h-[calc(100dvh-3.5rem)] xl:overflow-y-auto xl:border-s">
        {selected ? (
          <div className="px-4 py-10 sm:px-8">
            <h2 className="text-xl">{selected.name}</h2>
            <p className="mt-1 text-[0.8125rem] text-ink-2">{selected.members.length === 1 ? 'One startup' : `${selected.members.length} startups, all shown`} · descriptions using {selected.words.map((w) => `“${w}”`).join(', ')}</p>
            <ul className="m-0 mt-4 list-none border-t border-control p-0">
              {selected.members.map((m) => (
                <li key={m.id} className="grid gap-0.5 border-b border-hairline py-3">
                  <Link to="/startups/$id" params={{ id: m.id }} className="font-medium text-ink no-underline hover:text-glaze hover:underline">
                    {m.name}
                  </Link>
                  <span className="line-clamp-2 text-[0.8125rem] text-ink-2">{m.description ?? 'No description in the registry.'}</span>
                  <span className="text-[0.8125rem] text-ink-2">{[m.sector, yearOf(m.cohort) && `labelled ${yearOf(m.cohort)}`].filter(Boolean).join(' · ')}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="hidden px-8 py-14 text-sm text-ink-2 xl:block">Choose “See the startups” on a group to list them here, beside the wall.</div>
        )}
      </aside>
    </div>
  )
}
