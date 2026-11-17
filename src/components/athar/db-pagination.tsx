import { ChevronLeft, ChevronRight } from 'lucide-react'

import { usePagination } from '@/components/interior/pagination'
import { cn } from '@/lib/utils'

/** Interior's page windowing (first, last, neighbours, gaps) with Athar's controls: 32px targets, ink numbers. */
export function DbPagination({ page, pages, onPage }: { page: number; pages: number; onPage: (page: number) => void }) {
  const p = usePagination({ count: pages, page, onPageChange: onPage })
  if (pages <= 1) return null
  const cell = 'inline-flex h-8 min-w-8 items-center justify-center rounded-md px-2 text-[0.8125rem] tabular-nums text-ink'
  return (
    <nav aria-label="Pages" className="flex items-center gap-1">
      <button type="button" disabled={!p.canPrev} onClick={p.prev} aria-label="Previous page" className={cn(cell, 'border border-edge hover:bg-surface-raised disabled:pointer-events-none disabled:opacity-50')}>
        <ChevronLeft className="size-4" aria-hidden />
      </button>
      {p.items.map((item) =>
        typeof item === 'number' ? (
          <button
            key={item}
            type="button"
            onClick={() => p.goTo(item)}
            aria-current={item === p.page ? 'page' : undefined}
            className={cn(cell, item === p.page ? 'bg-ink font-medium text-canvas' : 'hover:bg-surface-raised')}
          >
            {item}
          </button>
        ) : (
          <span key={item} aria-hidden className={cn(cell, 'px-1')}>
            …
          </span>
        ),
      )}
      <button type="button" disabled={!p.canNext} onClick={p.next} aria-label="Next page" className={cn(cell, 'border border-edge hover:bg-surface-raised disabled:pointer-events-none disabled:opacity-50')}>
        <ChevronRight className="size-4" aria-hidden />
      </button>
    </nav>
  )
}
