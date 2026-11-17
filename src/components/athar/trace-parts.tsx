import { useNavigate } from '@tanstack/react-router'
import { Check, Copy, CornerDownLeft, X } from 'lucide-react'
import { useState } from 'react'

import { useCopyToClipboard } from '@/components/interior/copy-button'
import { cn } from '@/lib/utils'
import { rowByNumber } from '#/server/api/trace'

// Interior's copy behaviour (clipboard, timeout, status) on Athar's own button: ink text, edge border, 13px.
export function TraceCopy({ value, label, className }: { value: string; label: string; className?: string }) {
  const { copy, status } = useCopyToClipboard({ timeout: 1800 })
  const Icon = status === 'copied' ? Check : status === 'error' ? X : Copy
  return (
    <button
      type="button"
      onClick={() => copy(value)}
      className={cn(
        'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-edge bg-canvas px-2.5 text-[0.8125rem] font-medium text-ink hover:border-ink',
        className,
      )}
    >
      <Icon className="size-3.5" aria-hidden />
      <span aria-live="polite">{status === 'copied' ? 'Copied' : status === 'error' ? 'Could not copy' : label}</span>
    </button>
  )
}

/** Exact jump by registry row number: 12 opens row 12, never a name that contains 12. */
export function RowJump({ last, className }: { last: number; className?: string }) {
  const navigate = useNavigate()
  const [value, setValue] = useState('')
  const [miss, setMiss] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  return (
    <form
      className={cn('flex items-center gap-2', className)}
      onSubmit={async (e) => {
        e.preventDefault()
        const n = Number(value)
        if (!/^\d+$/.test(value.trim())) return setMiss('Type a row number.')
        setBusy(true)
        const id = await rowByNumber({ data: n }).finally(() => setBusy(false))
        if (!id) return setMiss(`There is no row ${n}. Rows go from 1 to ${last}.`)
        setMiss(null)
        setValue('')
        navigate({ to: '/portal/trace/$rowId', params: { rowId: id } })
      }}
    >
      <label className="text-[0.8125rem] text-ink-2" htmlFor="row-jump">
        Go to row
      </label>
      <input
        id="row-jump"
        inputMode="numeric"
        value={value}
        onChange={(e) => (setMiss(null), setValue(e.target.value))}
        placeholder={`1–${last}`}
        aria-describedby={miss ? 'row-jump-miss' : undefined}
        className="h-9 w-24 rounded-md border border-edge bg-canvas px-3 text-[0.875rem] text-ink tabular-nums placeholder:text-ink-2"
      />
      <button
        type="submit"
        disabled={busy}
        aria-label="Open row"
        className="grid size-9 place-items-center rounded-md border border-edge text-ink hover:border-ink disabled:cursor-wait"
      >
        <CornerDownLeft className="size-4" aria-hidden />
      </button>
      {miss && (
        <span id="row-jump-miss" role="alert" className="text-[0.8125rem] text-ink">
          {miss}
        </span>
      )}
    </form>
  )
}

const LABELS: Record<string, string> = {
  name: 'Name',
  desc: 'Description',
  description: 'Description',
  sector: 'Sector',
  industry: 'Industry',
  website: 'Website',
  domain: 'Website domain',
  founders: 'Founders',
  label: 'Label date',
  cohort: 'Label date',
  cohort_date: 'Label date',
  creation_year: 'Creation year',
  logo: 'Logo',
  logo_id: 'Logo id',
  email: 'Email',
  phone: 'Phone',
}
export const fieldLabel = (key: string) => LABELS[key] ?? key.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase())

/** A stored value as words: lists joined, nothing shown as "Empty". */
export function valueText(v: unknown): string {
  if (v === null || v === undefined || v === '') return ''
  if (Array.isArray(v)) return v.map(valueText).filter(Boolean).join(', ')
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

export function Value({ v, className }: { v: unknown; className?: string }) {
  const t = valueText(v)
  return t ? <span className={cn('break-words text-ink', className)}>{t}</span> : <span className="text-ink-2">Empty</span>
}
