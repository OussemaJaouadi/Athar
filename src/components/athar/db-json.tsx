import { ChevronRight } from 'lucide-react'
import { useState } from 'react'

import { EmptyValue, Fields, JsonBlock, isEmpty, type DeskField } from '@/components/athar/desk'
import { CopyButton } from '@/components/interior/copy-button'
import { SegmentedControl } from '@/components/interior/segmented-control'
import { cn } from '@/lib/utils'

// The Interior copy button ships with stone and blue colours; every one is replaced here by an Athar token.
const copyLook =
  'h-8 border-edge! bg-canvas! text-ink! shadow-none! hover:bg-surface! dark:border-edge! dark:bg-canvas! dark:text-ink! dark:shadow-none! dark:hover:bg-surface! focus-visible:border-glaze! dark:focus-visible:border-glaze! focus-visible:shadow-none! dark:focus-visible:shadow-none!'

export const CopyJson = ({ value, label = 'Copy JSON', className }: { value: unknown; label?: string; className?: string }) => (
  <CopyButton value={JSON.stringify(value, null, 2)} label={label} copiedLabel="Copied" className={cn(copyLook, className)} />
)

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** One registry value as a field value: lists as lines, nested objects as compact JSON, empty as nothing. */
export function plainValue(v: unknown): React.ReactNode {
  if (isEmpty(v)) return null
  if (Array.isArray(v)) {
    return v.every((x) => typeof x === 'string' || typeof x === 'number') ? (
      <ul className="grid gap-0.5">
        {v.map((x, i) => (
          <li key={`${x}-${i}`} dir="auto">
            {String(x)}
          </li>
        ))}
      </ul>
    ) : (
      <span className="font-mono text-[0.8125rem]">{JSON.stringify(v)}</span>
    )
  }
  if (isObject(v)) return <span className="font-mono text-[0.8125rem]">{JSON.stringify(v)}</span>
  return <span dir="auto">{String(v)}</span>
}

/**
 * A parsed row in the pane: every key as a labelled field, or the highlighted JSON, with the Interior copy button.
 * The key (`row.id`) should reset the view when another row is selected.
 */
export function ParsedRow({ value, title }: { value: unknown; title: string }) {
  const [mode, setMode] = useState<'fields' | 'json'>('fields')
  if (!isObject(value)) return <JsonBlock value={value} title={title} />
  const fields: DeskField[] = Object.entries(value).map(([label, v]) => ({ label, value: plainValue(v) }))
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <SegmentedControl
          label={`${title}: how to read it`}
          value={mode}
          options={[
            { value: 'fields', label: 'Fields' },
            { value: 'json', label: 'JSON' },
          ]}
          onValueChange={(v) => setMode(v === 'json' ? 'json' : 'fields')}
        />
        <CopyJson value={value} label="Copy JSON" className="ms-auto" />
      </div>
      {mode === 'json' ? <JsonBlock value={value} title={title} /> : <Fields fields={fields} />}
    </div>
  )
}

/** A table row as JSON: one line collapsed, the highlighted block expanded. */
export function JsonRows({
  rows,
  rowKey,
  selected,
  onSelect,
}: {
  rows: { key: string; value: unknown }[]
  rowKey: string
  selected: string | undefined
  onSelect: (key: string) => void
}) {
  const [open, setOpen] = useState<Set<string>>(() => new Set())
  const toggle = (k: string) =>
    setOpen((prev) => {
      const next = new Set(prev)
      if (!next.delete(k)) next.add(k)
      return next
    })
  return (
    <ul aria-label="Rows as JSON" className="min-w-0">
      {rows.map((r) => {
        const on = open.has(r.key)
        const text = JSON.stringify(r.value)
        const id = `json-row-${r.key}`
        return (
          <li key={r.key} className={cn('border-b border-hairline', selected === r.key && 'bg-surface shadow-[inset_3px_0_0_var(--ink)]')}>
            <button
              type="button"
              aria-expanded={on}
              aria-controls={id}
              onClick={() => {
                toggle(r.key)
                onSelect(r.key)
              }}
              className="flex w-full min-w-0 items-center gap-2 px-4 py-2 text-start hover:bg-surface"
            >
              <ChevronRight className={cn('size-4 shrink-0 text-ink-2 transition-transform motion-reduce:transition-none', on && 'rotate-90')} aria-hidden />
              <span className="shrink-0 font-mono text-[0.8125rem] text-ink" title={rowKey}>
                {r.key}
              </span>
              <span className="min-w-0 truncate font-mono text-[0.8125rem] text-ink-2">{text}</span>
            </button>
            {on && (
              <div id={id} className="px-4 pb-3">
                <JsonBlock value={r.value} title={`${rowKey} ${r.key}`} />
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}

/** A registry value in one grid cell: lists with their count, nothing as "empty", long text left to the cell to cut. */
export function RawCell({ name, v }: { name: string; v: unknown }) {
  if (isEmpty(v)) return <EmptyValue />
  if (Array.isArray(v)) {
    const text = v.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(', ')
    return (
      <span title={text}>
        <span className="text-ink-2 tabular-nums">{v.length} · </span>
        {text}
      </span>
    )
  }
  if (isObject(v)) return <span className="font-mono text-[0.8125rem]">{JSON.stringify(v)}</span>
  const text = String(v)
  const mono = /^(https?:|www\.)/i.test(text.trim()) || name === 'logo_id'
  return (
    <span dir="auto" title={text} className={cn(typeof v === 'number' && 'tabular-nums', mono && 'font-mono text-[0.8125rem]')}>
      {text}
    </span>
  )
}

/** The registry's keys in the order a reader wants them; any key not listed follows, as first met. */
const KEY_ORDER = ['name', 'industry', 'sector', 'creation_year', 'label', 'website', 'founders', 'email', 'phone', 'desc']

export function registryKeys(parsed: unknown[]): string[] {
  const seen: string[] = []
  for (const p of parsed) if (isObject(p)) for (const k of Object.keys(p)) if (!seen.includes(k)) seen.push(k)
  const first = KEY_ORDER.filter((k) => seen.includes(k))
  return [...first, ...seen.filter((k) => !first.includes(k))]
}
