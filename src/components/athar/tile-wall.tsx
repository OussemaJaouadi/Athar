import { Link } from '@tanstack/react-router'
import { useMemo } from 'react'

import { cn } from '@/lib/utils'
import type { WallTile } from '#/server/api/app'

// Older cohorts glaze darker, like tiles that have been on the wall longest.
const SHADES = ['bg-zinc-900', 'bg-zinc-800', 'bg-zinc-700', 'bg-zinc-600', 'bg-zinc-500', 'bg-zinc-400']

export function shade(year: number | null, min: number, max: number) {
  if (!year || max === min) return SHADES[2]
  const i = Math.round(((year - min) / (max - min)) * (SHADES.length - 1))
  return SHADES[Math.min(SHADES.length - 1, Math.max(0, i))]
}

export function useWallGroups(tiles: WallTile[]) {
  return useMemo(() => {
    const years = tiles.map((t) => t.year).filter((y): y is number => !!y)
    const bySector = new Map<string, WallTile[]>()
    for (const t of tiles) bySector.set(t.sector ?? 'Unknown', [...(bySector.get(t.sector ?? 'Unknown') ?? []), t])
    return { sectors: [...bySector.entries()].sort((a, b) => b[1].length - a[1].length), min: Math.min(...years), max: Math.max(...years) }
  }, [tiles])
}

/** One tile. A startup without a description is a missing tile: you see where evidence fell out. */
export function Tile({ t, min, max, marked, dim, size = 'sm' }: { t: WallTile; min: number; max: number; marked?: boolean; dim?: boolean; size?: 'xs' | 'sm' }) {
  return (
    <span
      title={t.described ? `${t.name}${t.year ? ` · ${t.year}` : ''}` : `${t.name}: no description in the registry`}
      className={cn(
        size === 'xs' ? 'size-[5px]' : 'size-2',
        !t.described && 'outline outline-1 -outline-offset-1 outline-dashed outline-zinc-400',
        t.described && (marked ? 'bg-ochre' : shade(t.year, min, max)),
        dim && t.described && 'opacity-25',
      )}
    />
  )
}

/**
 * The archive as a Qallaline wall that doubles as the sector filter: one panel per sector,
 * one tile per startup. Search hits take the ochre evidence colour; the rest dim.
 */
export function SectorWall({ tiles, marked, active, className }: { tiles: WallTile[]; marked?: Set<string>; active?: string; className?: string }) {
  const { sectors, min, max } = useWallGroups(tiles)
  const filtering = marked !== undefined

  return (
    <div className={cn('grid grid-cols-2 gap-px border border-hairline bg-hairline sm:grid-cols-3 lg:grid-cols-6', className)}>
      {sectors.map(([sector, group]) => {
        const hits = filtering ? group.filter((t) => marked.has(t.id)).length : group.length
        const isActive = active === sector
        return (
          <Link
            key={sector}
            to="/search"
            search={(prev: Record<string, unknown>) => ({ ...prev, sector: isActive ? undefined : sector, open: undefined })}
            resetScroll={false}
            aria-pressed={isActive}
            aria-label={`${sector}, ${group.length} startups`}
            className={cn(
              'grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-1.5 px-2.5 py-2 no-underline transition-colors',
              isActive ? 'bg-surface-raised' : 'bg-canvas hover:bg-surface',
              active && !isActive && 'opacity-60',
            )}
          >
            <span className="flex items-baseline justify-between gap-2 font-mono text-[0.625rem] text-ink-2">
              <span className={cn('truncate', isActive && 'text-ink')}>{sector}</span>
              <span className="tabular-nums">{filtering ? `${hits}/${group.length}` : group.length}</span>
            </span>
            <span className="flex flex-wrap gap-px">
              {group.map((t) => (
                <Tile key={t.id} t={t} min={min} max={max} size="xs" marked={filtering && marked.has(t.id)} dim={filtering && !marked.has(t.id)} />
              ))}
            </span>
          </Link>
        )
      })}
    </div>
  )
}

/** A strip of tiles for any set of startups (themes, gaps), linking each tile to its record. */
export function TileStrip({ tiles, min, max, empty = 0, linked = true, className }: { tiles: WallTile[]; min: number; max: number; empty?: number; linked?: boolean; className?: string }) {
  return (
    <span className={cn('flex flex-wrap gap-[2px]', className)}>
      {tiles.map((t) =>
        linked ? (
          <Link key={t.id} to="/startups/$id" params={{ id: t.id }} aria-label={t.name} className="flex">
            <Tile t={t} min={min} max={max} />
          </Link>
        ) : (
          <Tile key={t.id} t={t} min={min} max={max} />
        ),
      )}
      {Array.from({ length: empty }, (_, i) => (
        <span key={`e${i}`} aria-hidden className="size-2 outline outline-1 -outline-offset-1 outline-dashed outline-ochre" />
      ))}
    </span>
  )
}
