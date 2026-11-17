import { Check, Copy, GripVertical, X } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useCallback, useEffect, useId, useRef, useState } from 'react'

import { useCopyToClipboard } from '@/components/interior/copy-button'
import { useDrawer } from '@/components/interior/drawer'
import { cn } from '@/lib/utils'

/*
 * The operator portal's kit: one density for every page. Sizes are 13–14px text, 32px controls, 8–12px padding.
 * Sentences in ink, labels in ink-2, borders on edge, no coloured text but links.
 */

export const opsControl =
  'h-8 rounded-md border border-edge bg-canvas px-2.5 text-[0.8125rem] text-ink placeholder:text-ink-2 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-glaze disabled:cursor-not-allowed disabled:opacity-60'
export const opsButton =
  'inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-md border border-edge bg-canvas px-2.5 text-[0.8125rem] font-medium whitespace-nowrap text-ink hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-glaze disabled:cursor-not-allowed disabled:opacity-60 [&_svg]:size-3.5 [&_svg]:shrink-0'
export const opsPrimary =
  'inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-md bg-glaze px-3 text-[0.8125rem] font-medium whitespace-nowrap text-glaze-ink hover:bg-[var(--glaze-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-glaze disabled:cursor-not-allowed disabled:opacity-60 [&_svg]:size-3.5 [&_svg]:shrink-0'
export const opsGhost =
  'inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-md px-2 text-[0.8125rem] font-medium whitespace-nowrap text-ink hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-glaze [&_svg]:size-3.5 [&_svg]:shrink-0'
/** Table parts: a quiet header, 36px rows, 13px text. */
export const opsTh = 'h-9 px-3 text-start text-[0.8125rem] font-medium whitespace-nowrap text-ink-2'
export const opsTd = 'px-3 py-2 text-[0.8125rem] text-ink'
export const opsRow = 'border-t border-hairline'
export const opsLabel = 'text-[0.8125rem] text-ink-2'

/** A page in the portal: a modest Amiri title, one plain line under it, actions on the right. */
export function OpsPage({
  title,
  lede,
  actions,
  children,
  className,
}: {
  title: React.ReactNode
  lede?: React.ReactNode
  actions?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <main className={cn('grid content-start gap-5 px-4 py-5 lg:px-8 lg:py-6', className)}>
      <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
        <div className="grid min-w-0 gap-1">
          <h1 className="font-display text-[1.375rem] leading-8 text-ink">{title}</h1>
          {lede && <p className="max-w-[80ch] text-[0.875rem] leading-6 text-ink">{lede}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </header>
      {children}
    </main>
  )
}

/** A section heading inside a portal page. */
export function OpsHeading({ children, aside, id }: { children: React.ReactNode; aside?: React.ReactNode; id?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <h2 id={id} className="font-sans text-[0.875rem] font-medium text-ink">
        {children}
      </h2>
      {aside}
    </div>
  )
}

const WIDTH_MIN = 380
const readWidth = (key: string, fallback: number) => {
  try {
    const v = Number(localStorage.getItem(`athar-drawer-${key}`))
    return Number.isFinite(v) && v >= WIDTH_MIN ? v : fallback
  } catch {
    return fallback
  }
}

/**
 * The portal's side drawer (Interior's drawer logic, Athar's panel). Non-modal: the list behind stays usable, so the
 * operator can click the next row and the drawer swaps its content. Drag the inner edge to resize (remembered per
 * drawer), drag the header or press Escape to close. `itemKey` crossfades the body when the item changes.
 */
export function OpsDrawer({
  open,
  onOpenChange,
  storageKey,
  defaultWidth = 560,
  eyebrow,
  title,
  actions,
  itemKey,
  footer,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  storageKey: string
  defaultWidth?: number
  eyebrow?: React.ReactNode
  title: React.ReactNode
  actions?: React.ReactNode
  itemKey?: string
  footer?: React.ReactNode
  children: React.ReactNode
}) {
  const reduced = useReducedMotion()
  const titleId = useId()
  const [width, setWidth] = useState(defaultWidth)
  useEffect(() => setWidth(readWidth(storageKey, defaultWidth)), [storageKey, defaultWidth])
  const drawer = useDrawer({ open, onOpenChange, side: 'right', width, modal: false })

  // Tell the page how much room the drawer takes, so the list behind it is never covered (wide screens only).
  useEffect(() => {
    const root = document.documentElement
    root.style.setProperty('--ops-drawer', open ? `${width}px` : '0px')
    return () => {
      root.style.setProperty('--ops-drawer', '0px')
    }
  }, [open, width])

  const max = () => Math.max(WIDTH_MIN, Math.min(1200, window.innerWidth - 96))
  const save = useCallback(
    (w: number) => {
      try {
        localStorage.setItem(`athar-drawer-${storageKey}`, String(Math.round(w)))
      } catch {}
    },
    [storageKey],
  )
  const resizing = useRef<{ x: number; w: number } | null>(null)
  const [dragging, setDragging] = useState(false)
  const onResizeDown = (e: React.PointerEvent) => {
    e.preventDefault()
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    resizing.current = { x: e.clientX, w: width }
    setDragging(true)
  }
  const onResizeMove = (e: React.PointerEvent) => {
    if (!resizing.current) return
    setWidth(Math.min(max(), Math.max(WIDTH_MIN, resizing.current.w + (resizing.current.x - e.clientX))))
  }
  const onResizeUp = () => {
    if (!resizing.current) return
    resizing.current = null
    setDragging(false)
    save(width)
  }
  const onResizeKey = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 96 : 32
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    e.preventDefault()
    const next = Math.min(max(), Math.max(WIDTH_MIN, width + (e.key === 'ArrowLeft' ? step : -step)))
    setWidth(next)
    save(next)
  }

  return (
    <div ref={drawer.rootRef} className="pointer-events-none fixed inset-y-0 top-14 right-0 z-40 overflow-hidden" style={{ width: width + 24 }}>
      <motion.div
        ref={drawer.panelRef}
        aria-labelledby={titleId}
        style={{ x: drawer.x, width, maxWidth: 'calc(100vw - 16px)' }}
        className={cn(
          'pointer-events-auto absolute inset-y-0 right-0 flex flex-col border-s border-edge bg-surface shadow-[-24px_0_48px_-32px_rgb(0_0_0/0.5)] outline-none',
          (drawer.dragging || dragging) && 'select-none',
          !open && 'pointer-events-none',
        )}
        {...drawer.panelProps}
      >
        <header
          onPointerDown={drawer.gripProps.onPointerDown}
          className={cn('flex items-start gap-3 border-b border-hairline px-4 py-3', drawer.dragging ? 'cursor-grabbing' : 'cursor-grab')}
        >
          <div className="grid min-w-0 flex-1 gap-0.5">
            {eyebrow && <p className="text-[0.8125rem] text-ink-2">{eyebrow}</p>}
            <h2 id={titleId} className="truncate font-sans text-[0.9375rem] font-medium text-ink">
              {title}
            </h2>
          </div>
          <div className="flex items-center gap-1" onPointerDown={(e) => e.stopPropagation()}>
            {actions}
            <button type="button" onClick={drawer.close} aria-label="Close panel" className={cn(opsGhost, 'w-8 px-0')}>
              <X aria-hidden />
            </button>
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={itemKey ?? 'body'}
              initial={reduced ? false : { opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduced ? undefined : { opacity: 0 }}
              transition={{ duration: 0.12, ease: [0.23, 1, 0.32, 1] }}
              className="px-4 py-3"
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </div>
        {footer && <div className="border-t border-hairline px-4 py-3">{footer}</div>}
        {/* Last in the panel so opening the drawer focuses its content, not the resize handle. */}
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize panel"
          aria-valuenow={Math.round(width)}
          aria-valuemin={WIDTH_MIN}
          tabIndex={0}
          onPointerDown={onResizeDown}
          onPointerMove={onResizeMove}
          onPointerUp={onResizeUp}
          onPointerCancel={onResizeUp}
          onKeyDown={onResizeKey}
          className="group absolute inset-y-0 -start-1.5 z-10 grid w-3 cursor-col-resize place-items-center focus-visible:outline-2 focus-visible:outline-glaze"
        >
          <span className={cn('h-full w-px bg-transparent transition-colors group-hover:bg-ink', dragging && 'bg-glaze')} />
          <GripVertical className="absolute size-3.5 rounded-sm bg-surface text-ink-2 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" aria-hidden />
        </div>
      </motion.div>
    </div>
  )
}

export type Field = { label: string; value: React.ReactNode; copy?: string; mono?: boolean; block?: boolean }

/**
 * Fields as a calm two-column list: label left in ink-2, value right in ink. Copy appears on hover or focus, never as
 * a column of boxes. `block` values (long text, JSON) take the full width under their label.
 */
export function FieldList({ fields, className }: { fields: Field[]; className?: string }) {
  return (
    <dl className={cn('grid grid-cols-[minmax(7rem,10rem)_minmax(0,1fr)] text-[0.8125rem]', className)}>
      {fields.map((f) => (
        <div key={f.label} className={cn('group col-span-2 grid grid-cols-subgrid items-start gap-x-4 border-t border-hairline py-2 first:border-0', f.block && 'grid-cols-1')}>
          <dt className="pt-px text-ink-2">{f.label}</dt>
          <dd className={cn('flex min-w-0 items-start gap-2 text-ink', f.block && 'col-span-2 mt-1')}>
            <div className={cn('min-w-0 flex-1 break-words', f.mono && 'font-mono text-[0.8125rem]')}>{f.value}</div>
            {f.copy !== undefined && f.copy !== '' && <CopyIcon text={f.copy} label={f.label} />}
          </dd>
        </div>
      ))}
    </dl>
  )
}

/** A quiet copy affordance: invisible until its row is hovered or it is focused. */
export function CopyIcon({ text, label, always }: { text: string; label: string; always?: boolean }) {
  const { copy, status } = useCopyToClipboard()
  return (
    <button
      type="button"
      onClick={() => copy(text)}
      aria-label={status === 'copied' ? `${label} copied` : `Copy ${label}`}
      className={cn(
        'grid size-6 shrink-0 place-items-center rounded text-ink-2 hover:bg-surface-raised hover:text-ink focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-glaze',
        !always && 'opacity-0 group-hover:opacity-100',
      )}
    >
      {status === 'copied' ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
    </button>
  )
}

/** Keyboard stepping through a list while a drawer is open: J/K or arrow down/up. */
export function useListStepper(ids: string[], current: string | undefined, go: (id: string) => void) {
  useEffect(() => {
    if (!current) return
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t.closest('input,textarea,select,[contenteditable]')) return
      const down = e.key === 'j' || e.key === 'ArrowDown'
      const up = e.key === 'k' || e.key === 'ArrowUp'
      if (!down && !up) return
      const i = ids.indexOf(current)
      const next = ids[i + (down ? 1 : -1)]
      if (next) {
        e.preventDefault()
        go(next)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [ids, current, go])
}
