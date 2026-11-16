import { Link, createFileRoute, getRouteApi } from '@tanstack/react-router'
import { useMemo } from 'react'

import { Panel, RecordLine, SampleTag } from '@/components/athar/kit'
import { TileStrip, useWallGroups } from '@/components/athar/tile-wall'
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

// Themes group startups by what they do; gaps are the tiles nobody laid.
function ThemesPage() {
  const { themes, gaps, selected } = Route.useLoaderData()
  const { wall } = shell.useLoaderData()
  const { min, max } = useWallGroups(wall)
  const byId = useMemo(() => new Map(wall.map((t) => [t.id, t])), [wall])
  const top = Math.max(...themes.map((t) => t.count), 1)

  return (
    <main className="grid grid-cols-[minmax(0,1fr)] gap-5 px-4 py-5 sm:px-6 lg:px-8">
      <div className="grid gap-1">
        <p className="flex items-center gap-2 font-mono text-[0.6875rem] tracking-wide text-ink-2 uppercase">
          Themes and gaps <SampleTag title="Themes are hand-written word groups until Embed clusters the archive" />
        </p>
        <h1 className="text-2xl font-semibold">What Tunisian startups work on, and where nobody tried</h1>
      </div>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_26rem]">
        <div className="grid gap-5">
          <section aria-label="Themes" className="grid gap-px border border-hairline bg-hairline sm:grid-cols-2 2xl:grid-cols-3">
            {themes.map((t) => {
              const on = selected?.id === t.id
              return (
                <Link
                  key={t.id}
                  to="/themes"
                  search={{ theme: t.id }}
                  resetScroll={false}
                  className={cn('grid content-start gap-3 p-4 no-underline transition-colors', on ? 'bg-surface-raised' : 'bg-canvas hover:bg-surface')}
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <h2 className="font-display text-base font-semibold text-ink">{t.name}</h2>
                    <span className="font-mono text-sm tabular-nums text-ink">{t.count}</span>
                  </div>
                  <div className="h-1 bg-surface-raised">
                    <div className="h-full bg-zinc-700" style={{ width: `${(t.count / top) * 100}%` }} />
                  </div>
                  <TileStrip linked={false} tiles={t.ids.slice(0, 120).map((id) => byId.get(id)).filter((x) => x !== undefined)} min={min} max={max} />
                  <YearBars years={t.years} />
                  <p className="truncate text-xs text-ink-2">{t.examples.map((e) => e.name).join(' · ')}</p>
                </Link>
              )
            })}
          </section>

          <Panel title="White space" meta="tiles nobody laid" bodyClassName="p-0">
            <ul className="grid gap-px bg-hairline sm:grid-cols-2 2xl:grid-cols-3">
              {gaps.map((g) => (
                <li key={g.id} className="bg-canvas">
                  <Link to="/themes" search={{ theme: g.id }} resetScroll={false} className={cn('grid gap-2 p-4 no-underline hover:bg-surface', selected?.id === g.id && 'bg-surface-raised')}>
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="font-display font-semibold text-ink">{g.name}</span>
                      <span className="font-mono text-sm text-ochre-text tabular-nums">{g.count === 0 ? 'none' : g.count}</span>
                    </div>
                    <TileStrip linked={false} tiles={g.examples.map((e) => byId.get(e.id)).filter((x) => x !== undefined)} min={min} max={max} empty={Math.max(0, 12 - g.count)} />
                    <p className="text-xs text-ink-2">{g.count === 0 ? 'No one tried this, as far as these records go.' : `Only ${g.examples.map((e) => e.name).join(', ')}.`}</p>
                  </Link>
                </li>
              ))}
            </ul>
          </Panel>
        </div>

        {selected && (
          <Panel
            as="aside"
            className="xl:sticky xl:top-16"
            title={selected.gap ? 'Gap' : 'Theme'}
            meta={`${selected.members.length} startups`}
            bodyClassName="p-0"
          >
            <div className="grid gap-2 border-b border-hairline p-4">
              <h2 className="text-xl font-semibold">{selected.name}</h2>
              <div className="flex flex-wrap items-center gap-1 text-xs text-ink-2">
                grouped by
                {selected.words.map((w) => (
                  <span key={w} className="rounded-sm bg-surface px-1.5 py-0.5 font-mono text-[0.6875rem] text-ink">{w}</span>
                ))}
              </div>
            </div>
            {selected.members.length === 0 ? (
              <p className="p-4 text-sm text-ink-2">No record in the archive matches. Check the idea itself to be sure.</p>
            ) : (
              <ol className="max-h-[70dvh] divide-y divide-hairline overflow-y-auto">
                {selected.members.map((m) => (
                  <li key={m.id}>
                    <RecordLine {...m} />
                  </li>
                ))}
              </ol>
            )}
          </Panel>
        )}
      </div>
    </main>
  )
}

function YearBars({ years }: { years: { year: string; count: number }[] }) {
  const all = ['2019', '2020', '2021', '2022', '2023', '2024', '2025']
  const top = Math.max(...years.map((y) => y.count), 1)
  return (
    <div className="grid grid-cols-7 items-end gap-1">
      {all.map((y) => {
        const c = years.find((x) => x.year === y)?.count ?? 0
        return (
          <div key={y} className="grid gap-0.5">
            <div className="flex h-6 items-end">
              <div className="w-full bg-zinc-500" style={{ height: `${Math.max(c ? 8 : 0, (c / top) * 100)}%` }} title={`${y}: ${c}`} />
            </div>
            <span className="text-center font-mono text-[0.5625rem] text-ink-2">{y.slice(2)}</span>
          </div>
        )
      })}
    </div>
  )
}
