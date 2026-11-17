import { Link } from '@tanstack/react-router'

import { cn } from '@/lib/utils'
import type { ChainInfo } from '#/server/api/app'

/** Marks data that stands in for an engine not built yet. Real startups, invented numbers. */
export function SampleTag({ className, title = 'Sample data until this engine is built' }: { className?: string; title?: string }) {
  return (
    <span
      title={title}
      className={cn('inline-flex items-center rounded-sm border border-dashed border-ochre px-1 font-mono text-[0.8125rem] leading-5 text-ink-2', className)}
    >
      sample
    </span>
  )
}

/** A page's title row: eyebrow, title, a line of context, and actions on the end side. */
export function PageHeader({ eyebrow, title, children, actions, className }: { eyebrow?: React.ReactNode; title: React.ReactNode; children?: React.ReactNode; actions?: React.ReactNode; className?: string }) {
  return (
    <header className={cn('flex flex-wrap items-end justify-between gap-x-8 gap-y-3', className)}>
      <div className="grid min-w-0 gap-1">
        {eyebrow && <p className="text-[0.8125rem] text-ink-2">{eyebrow}</p>}
        <h1 className="font-display text-[1.75rem] leading-9 text-balance">{title}</h1>
        {children && <div className="max-w-3xl text-[0.9375rem] leading-6 text-ink">{children}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  )
}

/** A bordered region with a mono caption: the archive's drawer, the lab's instrument. */
export function Panel({ title, meta, children, className, bodyClassName, as: As = 'section' }: { title?: React.ReactNode; meta?: React.ReactNode; children: React.ReactNode; className?: string; bodyClassName?: string; as?: 'section' | 'aside' | 'div' }) {
  return (
    <As className={cn('min-w-0 border border-edge bg-canvas', className)}>
      {title && (
        <div className="flex items-center justify-between gap-3 border-b border-hairline px-4 py-2.5">
          <h2 className="font-sans text-[0.9375rem] font-medium text-ink">{title}</h2>
          {meta && <div className="flex items-center gap-2 text-[0.8125rem] text-ink-2">{meta}</div>}
        </div>
      )}
      <div className={cn('p-4', bodyClassName)}>{children}</div>
    </As>
  )
}

export function Stat({ label, value, note, sample }: { label: string; value: React.ReactNode; note?: React.ReactNode; sample?: boolean }) {
  return (
    <div className="grid content-start gap-1 bg-canvas px-4 py-3">
      <div className="flex items-center gap-2 text-[0.8125rem] text-ink-2">
        {label} {sample && <SampleTag />}
      </div>
      <div className="font-display text-2xl font-semibold tabular-nums">{value}</div>
      {note && <div className="text-[0.8125rem] text-ink">{note}</div>}
    </div>
  )
}

/** Similarity as a short bar and a number; the bar is ochre because it is evidence of a match. */
export function Score({ value, className }: { value: number; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2 font-mono text-[0.8125rem] text-ink tabular-nums', className)} title={`Similarity ${value.toFixed(2)}`}>
      <span className="relative h-1 w-12 bg-surface-raised">
        <span className="absolute inset-y-0 start-0 bg-ochre" style={{ width: `${Math.round(value * 100)}%` }} />
      </span>
      {value.toFixed(2)}
    </span>
  )
}

export const catalogueNo = (id: string) => `ATH-${id.slice(-6).toUpperCase()}`
export const shortDate = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
export const labelledYear = (cohort: string | null) => (cohort ? cohort.slice(3) : null)

/** The isnad of one value, always visible: registry → snapshot → row → field → cleaning. */
export function ChainStrip({ chain, field, className }: { chain: ChainInfo | null; field: string; className?: string }) {
  if (!chain) return <span className="font-mono text-[0.8125rem] text-ink-2">no chain</span>
  const change = chain.changes.find((c) => c.field === field)
  const links = ['registry', `snap ${chain.snapshot}`, `row ${chain.rowNumber}`, field]
  return (
    <ol className={cn('flex flex-wrap items-center gap-y-1 font-mono text-[0.8125rem] text-ink', className)} aria-label={`Chain for ${field}`}>
      {links.map((l, i) => (
        <li key={l} className="flex items-center">
          {i > 0 && <span aria-hidden className="mx-1 h-px w-2.5 bg-ochre" />}
          <span className={cn('rounded-sm border px-1 leading-4', i === links.length - 1 && !change ? 'border-ochre' : 'border-edge')}>{l}</span>
        </li>
      ))}
      {change && (
        <li className="flex items-center" title={change.why}>
          <span aria-hidden className="mx-1 h-px w-2.5 bg-ochre" />
          <span className="rounded-sm border border-ochre px-1 leading-4">cleaned</span>
        </li>
      )}
    </ol>
  )
}

/** A dense catalogue row used in lists across the reading room. */
export function RecordLine({ id, name, sector, cohort, description, active, to = 'profile', search, right }: { id: string; name: string; sector: string | null; cohort: string | null; description: string | null; active?: boolean; to?: 'profile' | 'preview'; search?: Record<string, unknown>; right?: React.ReactNode }) {
  const body = (
    <>
      <span className="font-mono text-[0.8125rem] text-ink-3 tabular-nums">{catalogueNo(id)}</span>
      <span className="min-w-0">
        <span className="flex items-baseline justify-between gap-3">
          <span className="truncate font-medium text-ink">{name}</span>
          {right ?? <span className="shrink-0 font-mono text-[0.8125rem] text-ink-3">{labelledYear(cohort)}</span>}
        </span>
        <span className="block truncate text-[0.8125rem] text-ink">
          {sector}
          {description ? ` · ${description}` : <em className="not-italic text-ink-2"> · no description in the registry</em>}
        </span>
      </span>
    </>
  )
  const cls = cn(
    'grid grid-cols-[5.5rem_minmax(0,1fr)] items-start gap-3 border-s-2 px-3 py-2.5 no-underline transition-colors hover:bg-surface',
    active ? 'border-ochre bg-surface' : 'border-transparent',
  )
  return to === 'preview' ? (
    <Link to="/search" search={(prev: Record<string, unknown>) => ({ ...prev, ...search, open: id })} className={cls} resetScroll={false}>
      {body}
    </Link>
  ) : (
    <Link to="/startups/$id" params={{ id }} className={cls}>
      {body}
    </Link>
  )
}
