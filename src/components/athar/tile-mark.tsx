import { cn } from '@/lib/utils'

/*
 * Every startup gets a tile: a small Qallaline-style glazed square, the same one everywhere.
 * Its glaze comes from the sector (five DESIGN.md slots); its pattern from the startup itself.
 * Sectors beyond five glazes are told apart by pattern family, so no colour repeats silently.
 */

const GLAZES = [
  { fill: 'var(--glaze)', ink: 'var(--canvas)' }, // A copper green
  { fill: 'var(--ochre)', ink: 'var(--canvas)' }, // B antimony ochre
  { fill: 'var(--tile-manganese)', ink: 'var(--canvas)' }, // C manganese
  { fill: 'var(--tile-terracotta)', ink: 'var(--canvas)' }, // D terracotta
  { fill: 'var(--tile-steel)', ink: 'var(--canvas)' }, // E steel
] as const

const SECTORS = [
  'Business Software and services',
  'Commerce and shopping',
  'HealthTech',
  'EdTech',
  'Ad Tech and Creative Tech',
  'Fintech',
  'Mobility',
  'Agritech',
  'Consumer products and services',
  'Advanced Manufacturing & Robotics',
  'Environment',
  'TravelTech',
  'FoodTech & New Food',
  'Wellness',
  'Communication services',
  'Security',
  'Real Estate Tech',
  'Social Business',
]

const hash = (s: string) => {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}

/** The sector's glaze and pattern family, stable across the app. */
export function sectorStyle(sector: string | null) {
  const i = sector ? SECTORS.indexOf(sector) : -1
  const k = i >= 0 ? i : hash(sector ?? '') % 18
  return { glaze: GLAZES[k % 5], family: Math.floor(k / 5) % 4 }
}

// Four motif families from the tile workshops: star, quatrefoil, arch, lattice.
function Motif({ family, variant, ink }: { family: number; variant: number; ink: string }) {
  const r = variant % 3
  switch (family) {
    case 0: // eight-point star
      return (
        <g fill={ink}>
          <rect x="11" y="11" width="18" height="18" />
          <rect x="11" y="11" width="18" height="18" transform="rotate(45 20 20)" />
          {r > 0 && <circle cx="20" cy="20" r="4" fill="currentColor" />}
        </g>
      )
    case 1: // quatrefoil
      return (
        <g fill={ink}>
          {[
            [20, 11],
            [29, 20],
            [20, 29],
            [11, 20],
          ].map(([cx, cy]) => (
            <circle key={`${cx}${cy}`} cx={cx} cy={cy} r={r === 2 ? 7 : 6} />
          ))}
          {r === 1 && <circle cx="20" cy="20" r="3" fill="currentColor" />}
        </g>
      )
    case 2: // arch
      return (
        <g fill={ink}>
          <path d="M9 34 V20 a11 11 0 0 1 22 0 V34 Z" />
          {r > 0 && <path d="M15 34 V22 a5 5 0 0 1 10 0 V34 Z" fill="currentColor" />}
        </g>
      )
    default: // lattice
      return (
        <g stroke={ink} strokeWidth={r === 2 ? 4 : 3} fill="none">
          <path d="M0 20 L20 0 L40 20 L20 40 Z" />
          {r > 0 && <path d="M10 20 L20 10 L30 20 L20 30 Z" />}
        </g>
      )
  }
}

export function TileMark({ id, sector, size = 32, className, title }: { id: string; sector: string | null; size?: number; className?: string; title?: string }) {
  const { glaze, family } = sectorStyle(sector)
  const variant = hash(id) % 6
  const rotate = (variant % 2) * 45
  return (
    <svg
      viewBox="0 0 40 40"
      width={size}
      height={size}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      className={cn('shrink-0 rounded-[3px]', className)}
      style={{ color: glaze.fill }}
    >
      <rect width="40" height="40" fill={glaze.fill} />
      <g transform={`rotate(${rotate} 20 20)`}>
        <Motif family={family} variant={variant} ink={glaze.ink} />
      </g>
    </svg>
  )
}

/** A sector's swatch for legends and filters: the tile, without the startup's own variation. */
export function SectorSwatch({ sector, size = 14 }: { sector: string; size?: number }) {
  return <TileMark id={sector} sector={sector} size={size} />
}
