import { ScrollArea as Primitive } from 'radix-ui'
import { forwardRef, useCallback, useState } from 'react'

import { cn } from '@/lib/utils'

/**
 * The one scrolling pane for Athar. Native scrolling (wheel, touch, keys, find-in-page), a square 8px thumb
 * that appears on hover and while scrolling, and a hairline at an edge only when content continues past it.
 * The ref is the viewport, so a list can reset its scroll position.
 */
export const Scroller = forwardRef<HTMLDivElement, { className?: string; children: React.ReactNode; axis?: 'y' | 'both'; label?: string }>(function Scroller(
  { className, children, axis = 'y', label },
  ref,
) {
  const [edges, setEdges] = useState({ top: false, bottom: false })
  const measure = useCallback((el: HTMLDivElement | null) => {
    if (!el) return
    const top = el.scrollTop > 0
    const bottom = el.scrollTop + el.clientHeight < el.scrollHeight - 1
    setEdges((e) => (e.top === top && e.bottom === bottom ? e : { top, bottom }))
  }, [])

  return (
    <Primitive.Root type="hover" scrollHideDelay={600} className={cn('relative min-h-0 overflow-hidden', className)}>
      <Primitive.Viewport
        ref={(el) => {
          measure(el)
          if (typeof ref === 'function') ref(el)
          else if (ref) ref.current = el
        }}
        aria-label={label}
        onScroll={(e) => measure(e.currentTarget)}
        className="size-full overscroll-contain outline-none focus-visible:ring-2 focus-visible:ring-glaze focus-visible:ring-inset"
      >
        {children}
      </Primitive.Viewport>
      <span aria-hidden className={cn('pointer-events-none absolute inset-x-0 top-0 h-px bg-hairline transition-opacity duration-150', edges.top ? 'opacity-100' : 'opacity-0')} />
      <span aria-hidden className={cn('pointer-events-none absolute inset-x-0 bottom-0 h-px bg-hairline transition-opacity duration-150', edges.bottom ? 'opacity-100' : 'opacity-0')} />
      <Bar orientation="vertical" />
      {axis === 'both' && <Bar orientation="horizontal" />}
      <Primitive.Corner />
    </Primitive.Root>
  )
})

function Bar({ orientation }: { orientation: 'vertical' | 'horizontal' }) {
  return (
    <Primitive.Scrollbar
      orientation={orientation}
      className={cn(
        'z-10 flex touch-none p-0.5 select-none transition-opacity duration-150 data-[state=hidden]:opacity-0 data-[state=visible]:opacity-100',
        orientation === 'vertical' ? 'w-3 me-0.5' : 'h-3 flex-col mb-0.5',
      )}
    >
      <Primitive.Thumb className="relative min-h-8 min-w-8 flex-1 bg-hairline transition-colors hover:bg-control active:bg-control" />
    </Primitive.Scrollbar>
  )
}
