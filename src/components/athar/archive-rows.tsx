import { Link } from '@tanstack/react-router'

import type { PersonListRow, SectorListRow, YearListRow } from '#/server/api/app'
import { SectorSwatch } from '@/components/athar/tile-mark'
import { cn } from '@/lib/utils'

// The Archive's ledger rows for people, sectors and years. Each is a real link to the entity's own page; on a wide
// screen a click opens it in the right pane instead (`onOpen`), the way a startup row does.

const row = (on: boolean) =>
  cn(
    'grid items-center gap-x-3 px-3 py-2 no-underline transition-colors duration-150 -outline-offset-2 focus-visible:bg-surface motion-reduce:transition-none',
    on ? 'bg-surface shadow-[inset_2px_0_0_var(--glaze)]' : 'hover:bg-surface',
  )

const pct = (share: number) => (share >= 0.1 ? `${Math.round(share * 100)}%` : `${(share * 100).toFixed(1)}%`)
const n = (count: number, one: string, many = `${one}s`) => `${count.toLocaleString('en-GB')} ${count === 1 ? one : many}`

type RowProps<T> = { item: T; on: boolean; onOpen: (e: React.MouseEvent) => void }

export function PersonRow({ item, on, onOpen }: RowProps<PersonListRow>) {
  return (
    <Link to="/people/$slug" params={{ slug: item.slug }} data-id={item.slug} aria-current={on ? 'page' : undefined} onClick={onOpen} className={cn(row(on), 'grid-cols-[minmax(0,1fr)_auto]')}>
      <span className="grid min-w-0 gap-0.5">
        <span className="truncate text-sm font-medium text-ink" dir="auto">
          {item.name}
        </span>
        <span className="truncate text-[0.8125rem] text-ink-2">
          {n(item.startups, 'startup')}
          {item.years.length > 0 && <> · {item.years.length > 3 ? `${item.years[0]} to ${item.years.at(-1)}` : item.years.join(', ')}</>}
        </span>
        {item.unconfirmed && <span className="text-[0.8125rem] text-ink-2">Name on {item.startups} startups, not confirmed as one person</span>}
      </span>
      <span className="font-mono text-[0.8125rem] text-ink-3 tabular-nums">{item.startups}</span>
    </Link>
  )
}

export function SectorRow({ item, on, onOpen }: RowProps<SectorListRow>) {
  const span = item.firstYear ? (item.firstYear === item.lastYear ? item.firstYear : `${item.firstYear} to ${item.lastYear}`) : null
  return (
    <Link to="/sectors/$slug" params={{ slug: item.slug }} data-id={item.slug} aria-current={on ? 'page' : undefined} onClick={onOpen} className={cn(row(on), 'grid-cols-[1rem_minmax(0,1fr)_auto]')}>
      <SectorSwatch sector={item.sector} size={14} />
      <span className="grid min-w-0 gap-0.5">
        <span className="truncate text-sm font-medium text-ink">{item.sector}</span>
        <span className="truncate text-[0.8125rem] text-ink-2">
          {n(item.count, 'startup')} · {pct(item.share)}
          {span && <> · {span}</>}
        </span>
        <span className="truncate text-[0.8125rem] text-ink-2">{item.asked ? `${item.answers} of ${item.asked} websites answer today` : 'No website asked yet'}</span>
      </span>
      <span className="font-mono text-[0.8125rem] text-ink-3 tabular-nums">{item.count}</span>
    </Link>
  )
}

export function YearRow({ item, on, onOpen }: RowProps<YearListRow>) {
  return (
    <Link to="/years/$year" params={{ year: item.year }} data-id={item.year} aria-current={on ? 'page' : undefined} onClick={onOpen} className={cn(row(on), 'grid-cols-[3.25rem_minmax(0,1fr)_auto]')}>
      <span className="font-display text-xl font-bold text-ink tabular-nums">{item.year}</span>
      <span className="grid min-w-0 gap-0.5">
        <span className="truncate text-sm font-medium text-ink">
          {n(item.count, 'startup')} · {pct(item.share)}
        </span>
        <span className="truncate text-[0.8125rem] text-ink-2">
          {n(item.sectors, 'sector')}
          {item.asked > 0 && <> · {item.answers} of {item.asked} websites answer</>}
        </span>
      </span>
      <span className="font-mono text-[0.8125rem] text-ink-3 tabular-nums">{item.count}</span>
    </Link>
  )
}
