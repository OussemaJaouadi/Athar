import { Link } from '@tanstack/react-router'
import { useMemo } from 'react'

import { cn } from '@/lib/utils'
import type { WallTile } from '#/server/api/app'

// Older cohorts glaze darker, like tiles that have been on the wall longest.
const SHADES = ['bg-zinc-900', 'bg-zinc-800', 'bg-zinc-700', 'bg-zinc-600', 'bg-zinc-500', 'bg-zinc-400']

function shade(year: number | null, min: number, max: number) {
  if (!year || max === min) return SHADES[2]
  const i = Math.round(((year - min) / (max - min)) * (SHADES.length - 1))
  return SHADES[Math.min(SHADES.length - 1, Math.max(0, i))]
}

/**
 * The archive as a Qallaline wall: one tile per startup, grouped by sector.
 * A tile with no description is drawn as a missing tile: you see where evidence fell out.
 * Tiles in `marked` (the current search) take the ochre evidence colour.
 */
export function TileWall({ tiles, marked, className }: { tiles: WallTile[]; marked?: Set<string>; className?: string }) {
  const { sectors, min, max } = useMemo(() => {
    const years = tiles.map((t) => t.year).filter((y): y is number => !!y)
    const bySector = new Map<string, WallTile[]>()
    for (const t of tiles) bySector.set(t.sector ?? 'Unknown', [...(bySector.get(t.sector ?? 'Unknown') ?? []), t])
    return { sectors: [...bySector.entries()], min: Math.min(...years), max: Math.max(...years) }
  }, [tiles])

  return (
    <div className={cn('grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3', className)}>
      {sectors.map(([sector, group]) => (
        <section key={sector} aria-label={`${sector}, ${group.length} startups`} className="min-w-0">
          <div className="mb-1.5 flex items-baseline justify-between gap-2 font-mono text-[0.6875rem] text-ink-2">
            <span className="truncate">{sector}</span>
            <span className="tabular-nums">{group.length}</span>
          </div>
          <div className="flex flex-wrap gap-[2px]">
            {group.map((t) => (
              <Link
                key={t.id}
                to="/startups/$id"
                params={{ id: t.id }}
                title={t.described ? t.name : `${t.name}: no description in the registry`}
                aria-label={t.name}
                className={cn(
                  'size-2.5 transition-transform duration-150 hover:scale-150 focus-visible:scale-150',
                  !t.described && 'border border-dashed border-zinc-400 bg-transparent',
                  t.described && (marked?.has(t.id) ? 'bg-ochre' : shade(t.year, min, max)),
                  marked && marked.size > 0 && !marked.has(t.id) && t.described && 'opacity-35',
                )}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
