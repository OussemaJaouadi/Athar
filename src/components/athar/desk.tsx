import { Link } from '@tanstack/react-router'
import { ChevronLeft, Inbox } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

import { CodeBlock, CodeBlockCopyButton, CodeBlockHeader, CodeBlockTitle } from '@/components/reui/code-block/code-block'
import type { CodeBlockTransformer } from '@/components/reui/code-block/code-block'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'

/*
 * The split desk (direction B, picked by the owner on 17 Nov 2026): every portal page is a list on the left and a
 * permanent detail pane on the right. The pane is part of the page: no overlay, no slide-in, no close button.
 * Sizes from the mock: 14px text, 13px labels, ~52px list items, 36px table rows, 32px controls, 22px Amiri titles.
 */

export const deskBtn =
  'inline-flex h-8 shrink-0 items-center gap-2 rounded-[5px] border border-edge px-3 text-[0.875rem] whitespace-nowrap text-ink hover:bg-surface-raised disabled:cursor-not-allowed disabled:opacity-60 [&_svg]:size-4 [&_svg]:shrink-0'
export const deskPrimary =
  'inline-flex h-8 shrink-0 items-center gap-2 rounded-[5px] border border-glaze bg-glaze px-3 text-[0.875rem] font-medium whitespace-nowrap text-glaze-ink hover:bg-[var(--glaze-hover)] disabled:cursor-not-allowed disabled:opacity-60 [&_svg]:size-4 [&_svg]:shrink-0'
export const deskInput =
  'h-8 min-w-0 rounded-[5px] border border-edge bg-canvas px-2.5 text-[0.875rem] text-ink placeholder:text-ink-3 placeholder:italic'
export const deskTh = 'h-[34px] border-b border-edge px-3 text-start text-[0.8125rem] font-normal whitespace-nowrap text-ink-2'
export const deskTd = 'h-9 border-b border-hairline px-3 text-[0.875rem] text-ink'

export function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-block min-w-5 rounded-[4px] border border-edge px-1 text-center font-mono text-[0.8125rem] leading-[1.35]" aria-hidden>
      {children}
    </kbd>
  )
}

/** A filter chip in the page bar. The active one sits on a raised fill with an ink underline. */
export function Chip({ on, children, ...rest }: { on?: boolean; children: React.ReactNode } & Omit<React.ComponentProps<typeof Link>, 'children' | 'className'>) {
  return (
    <Link
      {...rest}
      aria-current={on ? 'true' : undefined}
      className={cn(
        'inline-flex h-7 items-center gap-1.5 rounded-[5px] border border-edge px-2.5 text-[0.8125rem] whitespace-nowrap text-ink no-underline',
        on ? 'bg-surface-raised shadow-[inset_0_-2px_0_var(--ink)]' : 'hover:bg-surface',
      )}
    >
      {children}
    </Link>
  )
}

/** The page bar: Amiri title, chips, then facts in ink-2 at the end. One row, no lede. */
export function DeskBar({ title, children, facts, actions }: { title: string; children?: React.ReactNode; facts?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="flex min-h-[57px] flex-wrap items-center gap-3.5 border-b border-hairline px-5 py-3">
      <h1 className="font-display text-[1.375rem] leading-none font-bold text-ink">{title}</h1>
      {children}
      <div className="ms-auto flex flex-wrap items-center gap-3.5">
        {facts && <span className="text-[0.8125rem] text-ink-2 tabular-nums">{facts}</span>}
        {actions}
      </div>
    </div>
  )
}

const LIST_MIN = 320
const LIST_MAX = 640

function useStoredWidth(key: string, fallback: number) {
  const [w, setW] = useState(fallback)
  useEffect(() => {
    try {
      const v = Number(localStorage.getItem(`athar-desk-${key}`))
      if (v >= LIST_MIN && v <= LIST_MAX) setW(v)
    } catch {}
  }, [key])
  const save = useCallback(
    (v: number) => {
      try {
        localStorage.setItem(`athar-desk-${key}`, String(Math.round(v)))
      } catch {}
    },
    [key],
  )
  return [w, setW, save] as const
}

/**
 * The desk: list | divider | pane, filling the viewport under the header and page bar, each side scrolling on its
 * own. The divider drags between 320 and 640px and the width is remembered per page. Below 1100px the list is the
 * page and a selection shows the pane alone with a back link (`onBack`).
 */
export function Desk({
  storageKey,
  list,
  pane,
  listWidth = 440,
  showPaneOnNarrow,
  onBack,
  backLabel = 'Back to the list',
}: {
  storageKey: string
  list: React.ReactNode
  pane: React.ReactNode
  listWidth?: number
  showPaneOnNarrow: boolean
  onBack: () => void
  backLabel?: string
}) {
  const [width, setWidth, save] = useStoredWidth(storageKey, listWidth)
  const drag = useRef<{ x: number; w: number } | null>(null)
  const [dragging, setDragging] = useState(false)

  return (
    <div
      className="grid min-h-0 flex-1 grid-cols-1 min-[1100px]:grid-cols-[var(--desk-list)_1px_minmax(0,1fr)]"
      style={{ ['--desk-list' as string]: `${width}px` }}
    >
      <div className={cn('min-h-0 min-w-0 overflow-y-auto overscroll-contain [scrollbar-width:thin] [scrollbar-color:var(--edge)_transparent]', showPaneOnNarrow && 'max-[1099px]:hidden')}>{list}</div>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize the list"
        aria-valuenow={Math.round(width)}
        aria-valuemin={LIST_MIN}
        aria-valuemax={LIST_MAX}
        tabIndex={0}
        onPointerDown={(e) => {
          e.preventDefault()
          ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
          drag.current = { x: e.clientX, w: width }
          setDragging(true)
        }}
        onPointerMove={(e) => {
          if (drag.current) setWidth(Math.min(LIST_MAX, Math.max(LIST_MIN, drag.current.w + e.clientX - drag.current.x)))
        }}
        onPointerUp={() => {
          drag.current = null
          setDragging(false)
          save(width)
        }}
        onKeyDown={(e) => {
          if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
          e.preventDefault()
          const next = Math.min(LIST_MAX, Math.max(LIST_MIN, width + (e.key === 'ArrowRight' ? 32 : -32)))
          setWidth(next)
          save(next)
        }}
        className={cn(
          'relative hidden cursor-col-resize bg-edge min-[1100px]:block',
          'after:absolute after:inset-y-0 after:-start-1 after:w-[9px] after:content-[""] hover:bg-ink',
          dragging && 'bg-ink',
        )}
      />
      <div className={cn('flex min-h-0 min-w-0 flex-col', !showPaneOnNarrow && 'max-[1099px]:hidden')}>
        <button type="button" onClick={onBack} className="flex h-10 items-center gap-1 border-b border-hairline px-4 text-[0.875rem] text-glaze min-[1100px]:hidden">
          <ChevronLeft className="size-4" aria-hidden />
          {backLabel}
        </button>
        {pane}
      </div>
    </div>
  )
}

/** A group header in a desk list: 500 weight, a count, an edge rule under it. */
export function DeskGroup({ label, count, children }: { label: React.ReactNode; count?: number; children?: React.ReactNode }) {
  return (
    <div className="sticky top-0 z-[1] flex items-center gap-2 border-b border-edge bg-canvas px-4 py-2 text-[0.875rem] font-medium text-ink">
      {children}
      <span className="min-w-0 truncate">{label}</span>
      {count !== undefined && <span className="text-[0.8125rem] font-normal text-ink-2 tabular-nums">· {count}</span>}
    </div>
  )
}

/**
 * One list item, two lines: the name with an ink-2 qualifier, then the value that matters. Selected: surface fill and
 * a 3px ink bar at the start edge.
 */
export function DeskItem({
  selected,
  onSelect,
  title,
  qualifier,
  detail,
  detailMono,
  lead,
  end,
  id,
  wrap,
}: {
  selected: boolean
  onSelect: () => void
  title: React.ReactNode
  qualifier?: React.ReactNode
  detail?: React.ReactNode
  detailMono?: boolean
  lead?: React.ReactNode
  end?: React.ReactNode
  id?: string
  /** Let the second line wrap instead of cutting it with an ellipsis. */
  wrap?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (selected) ref.current?.scrollIntoView({ block: 'nearest' })
  }, [selected])
  return (
    <div
      ref={ref}
      id={id}
      className={cn(
        'flex items-center gap-3 border-b border-hairline px-4 transition-colors duration-100 motion-reduce:transition-none',
        selected ? 'bg-surface shadow-[inset_3px_0_0_var(--ink)]' : 'hover:bg-surface',
      )}
    >
      {lead}
      <button
        type="button"
        onClick={onSelect}
        aria-current={selected ? 'true' : undefined}
        className="grid min-w-0 flex-1 gap-0.5 py-[9px] text-start"
      >
        <span className="truncate text-[0.875rem] text-ink">
          {title}
          {qualifier && <span className="text-[0.8125rem] text-ink-2 tabular-nums"> · {qualifier}</span>}
        </span>
        {detail !== undefined && <span className={cn('text-[0.8125rem] text-ink-2', wrap ? '[overflow-wrap:anywhere]' : 'truncate', detailMono && 'font-mono')}>{detail}</span>}
      </button>
      {end}
    </div>
  )
}

/** The detail pane: header (Amiri name, one plain statement, position at the end), scrolling body, fixed foot bar. */
export function DeskPane({
  title,
  statement,
  position,
  children,
  foot,
  headerEnd,
}: {
  title: React.ReactNode
  statement?: React.ReactNode
  position?: React.ReactNode
  children: React.ReactNode
  foot?: React.ReactNode
  headerEnd?: React.ReactNode
}) {
  return (
    <section aria-label="Details" className="flex min-h-0 min-w-0 flex-1 flex-col">
      <header className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-hairline px-6 py-3.5">
        <h2 className="font-display text-[1.375rem] leading-[1.15] font-bold text-ink">{title}</h2>
        {statement && <span className="text-[0.875rem] text-ink">{statement}</span>}
        <span className="ms-auto flex items-baseline gap-4">
          {headerEnd}
          {position && <span className="text-[0.8125rem] text-ink-2 tabular-nums">{position}</span>}
        </span>
      </header>
      <div className="grid min-h-0 flex-1 content-start gap-5 overflow-y-auto overscroll-contain [scrollbar-width:thin] [scrollbar-color:var(--edge)_transparent] px-6 py-[18px]">{children}</div>
      {foot && <div className="flex flex-wrap items-center gap-2.5 border-t border-edge bg-surface px-6 py-3">{foot}</div>}
    </section>
  )
}

/** Nothing to show in a pane: the Empty primitive (ReUI pattern c-empty-1), an icon tile over one sentence. */
export function DeskEmpty({ children, title }: { children: React.ReactNode; title?: string }) {
  return (
    <Empty className="flex-1">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Inbox aria-hidden />
        </EmptyMedia>
        {title && <EmptyTitle>{title}</EmptyTitle>}
        <EmptyDescription className="text-[0.875rem] text-ink">{children}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
}

/** A section inside the pane: a 13px ink-2 heading, then the content. No card. */
export function PaneSection({ title, aside, children, className, icon: Icon }: { title: React.ReactNode; aside?: React.ReactNode; children: React.ReactNode; className?: string; icon?: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean; strokeWidth?: number }> }) {
  return (
    <section className={cn('min-w-0', className)}>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <h3 className="flex items-center gap-1.5 font-sans text-[0.8125rem] font-medium text-ink-2">
          {Icon && <Icon className="size-4 shrink-0" strokeWidth={1.5} aria-hidden />}
          {title}
        </h3>
        {aside && <span className="text-[0.8125rem] text-ink-2">{aside}</span>}
      </div>
      {children}
    </section>
  )
}

export type DeskField = { label: string; value: React.ReactNode; mono?: boolean; bad?: boolean }

/** Empty values read "empty" in ink-3. */
export const isEmpty = (v: unknown) => v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0)
export function EmptyValue() {
  return <span className="text-ink-3">empty</span>
}

/** A record as labelled fields: a 150px label column, hairlines between rows. */
export function Fields({ fields, className }: { fields: DeskField[]; className?: string }) {
  return (
    <dl className={cn('grid grid-cols-[150px_minmax(0,1fr)]', className)}>
      {fields.map((f) => (
        <div key={f.label} className="contents">
          <dt className="border-b border-hairline py-[7px] text-[0.8125rem] text-ink-2">{f.label}</dt>
          <dd className={cn('border-b border-hairline py-[7px] text-[0.875rem] [overflow-wrap:anywhere] text-ink', f.mono && 'font-mono text-[0.8125rem]')}>
            {f.bad ? <span className="block border-s-[3px] border-ochre ps-2">{f.value}</span> : isEmpty(f.value) ? <EmptyValue /> : f.value}
          </dd>
        </div>
      ))}
    </dl>
  )
}

export type EvidenceRow = { field: string; wrote: React.ReactNode; cleaning: React.ReactNode; why: React.ReactNode; bad?: boolean }

/** "What cleaning did": Field / Registry wrote / Cleaning / Why. The offending value gets a 3px ochre bar. */
export function Evidence({ rows, headers = ['Field', 'Registry wrote', 'Cleaning', 'Why'] }: { rows: EvidenceRow[]; headers?: [string, string, string, string] }) {
  const cell = 'border-b border-hairline px-3 py-2 text-[0.875rem] [overflow-wrap:anywhere] text-ink'
  const head = 'border-b border-edge px-3 py-2 text-[0.8125rem] text-ink-2'
  return (
    <div role="table" className="grid grid-cols-[150px_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.2fr)] border border-edge [&>*:nth-last-child(-n+4)]:border-b-0">
      <div role="row" className="contents">
        {headers.map((h) => (
          <div role="columnheader" key={h} className={head}>
            {h}
          </div>
        ))}
      </div>
      {rows.map((r) => (
        <div role="row" key={r.field} className="contents">
          <div role="cell" className={cell}>
            {r.field}
          </div>
          <div role="cell" className={cn(cell, 'font-mono text-[0.8125rem]')}>
            {r.bad ? <span className="block border-s-[3px] border-ochre ps-2">{r.wrote}</span> : isEmpty(r.wrote) ? <EmptyValue /> : r.wrote}
          </div>
          <div role="cell" className={cell}>
            {r.cleaning}
          </div>
          <div role="cell" className={cell}>
            {r.why}
          </div>
        </div>
      ))}
    </div>
  )
}

// `null` shares the constant colour with numbers in the css-variables theme; this paints it terracotta. Module scope so
// renders never re-tokenize.
const JSON_TRANSFORMERS: CodeBlockTransformer[] = [
  {
    name: 'athar-null',
    span(node, _line, _col, _el, token) {
      if (token?.content.trim() === 'null') node.properties.style = 'color:var(--code-nil);--shiki-dark:var(--code-nil)'
    },
  },
]
const TOKEN_THEMES = { light: 'css-variables', dark: 'css-variables' }

/** Raw JSON: ReUI Code Block (Shiki) on Athar tokens, line numbers, soft wrap, folding, one copy button. */
export function JsonBlock({ value, title, text }: { value?: unknown; title?: string; text?: string }) {
  const code = text ?? JSON.stringify(value, null, 2)
  return (
    <CodeBlock
      code={code}
      language="json"
      themes={TOKEN_THEMES}
      transformers={JSON_TRANSFORMERS}
      showLineNumbers
      defaultWrap
      foldable
      label={title ?? 'Raw JSON'}
      className="rounded-none border-edge bg-surface font-mono text-[0.8125rem] leading-[1.6] [&_[data-slot=code-block-header]]:border-hairline"
    >
      <CodeBlockHeader>
        <CodeBlockTitle className="text-[0.8125rem] text-ink-2">{title ?? 'Raw JSON'}</CodeBlockTitle>
        <CodeBlockCopyButton className="ms-auto" />
      </CodeBlockHeader>
    </CodeBlock>
  )
}

/**
 * Desk keyboard: J/K or arrows move the selection, / focuses search, and page-specific keys (E, F, Z…) through
 * `keys`. Ignored while typing in a field.
 */
export function useDeskKeys({
  ids,
  current,
  select,
  search,
  keys,
}: {
  ids: string[]
  current: string | undefined
  select: (id: string) => void
  search?: React.RefObject<HTMLInputElement | null>
  keys?: Record<string, () => void>
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const t = e.target as HTMLElement
      if (t.closest('input,textarea,select,[contenteditable],[role=separator]')) {
        if (e.key === 'Escape' && t instanceof HTMLInputElement) t.blur()
        return
      }
      if (e.key === '/' && search?.current) {
        e.preventDefault()
        search.current.focus()
        return
      }
      const down = e.key === 'j' || e.key === 'ArrowDown'
      const up = e.key === 'k' || e.key === 'ArrowUp'
      if (down || up) {
        const i = current ? ids.indexOf(current) : -1
        const next = ids[Math.max(0, i + (down ? 1 : -1))]
        if (next && next !== current) {
          e.preventDefault()
          select(next)
        }
        return
      }
      const fn = keys?.[e.key.toLowerCase()]
      if (fn) {
        e.preventDefault()
        fn()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [ids, current, select, search, keys])
}

const menuSurface = 'rounded-[8px] border border-edge bg-canvas p-1 text-ink shadow-[0_16px_40px_-16px_rgb(0_0_0/0.5)] ring-0'
const triggerLook =
  'flex h-9 w-full items-center gap-2 rounded-[6px] border border-edge bg-canvas ps-2.5 pe-2 text-start text-[0.875rem] text-ink transition-colors duration-150 hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-glaze motion-reduce:transition-none'

/**
 * The portal's dropdown: Radix Select (shadcn) on Athar tokens, never the browser's native list. The trigger shows
 * only the chosen option's name; the menu is as wide as the trigger, with 40px rows, an optional mark before each
 * option, a quiet second line (`hint`) and a check on the chosen one.
 */
export function DeskSelect({
  value,
  onChange,
  options,
  id,
  label,
  className,
}: {
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string; hint?: string; mark?: React.ReactNode }[]
  id?: string
  label?: string
  className?: string
}) {
  const current = options.find((o) => o.value === value)
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id={id} aria-label={label} className={cn(triggerLook, 'focus-visible:border-ink focus-visible:ring-0 dark:bg-canvas dark:hover:bg-surface [&_svg]:text-ink-2', className)}>
        <span className="flex min-w-0 flex-1 items-center gap-2">
          {current?.mark}
          <SelectValue>{current?.label}</SelectValue>
        </span>
      </SelectTrigger>
      <SelectContent position="popper" sideOffset={4} className={cn(menuSurface, 'w-[var(--radix-select-trigger-width)] min-w-[var(--radix-select-trigger-width)]')}>
        {options.map((o) => (
          <SelectItem
            key={o.value}
            value={o.value}
            className="min-h-10 rounded-[5px] py-1.5 ps-2 pe-8 text-[0.875rem] text-ink focus:bg-surface-raised focus:text-ink data-[state=checked]:font-medium [&_svg]:text-ink"
          >
            <span className="flex items-center gap-2.5">
              {o.mark}
              <span className="grid">
                <span>{o.label}</span>
                {o.hint && <span className="text-[0.8125rem] font-normal text-ink-2">{o.hint}</span>}
              </span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
