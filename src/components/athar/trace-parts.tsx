import { CornerDownLeft } from 'lucide-react'
import { useState } from 'react'

import { opsControl, opsGhost } from '@/components/athar/ops'
import { cn } from '@/lib/utils'
import { rowByNumber } from '#/server/api/trace'

/** Exact jump by registry row number: 12 opens row 12, never a name that contains 12. */
export function RowJump({ last, onOpen, className }: { last: number; onOpen: (rowId: string) => void; className?: string }) {
  const [value, setValue] = useState('')
  const [miss, setMiss] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  return (
    <form
      className={cn('flex items-center gap-1.5', className)}
      onSubmit={async (e) => {
        e.preventDefault()
        if (!/^\d+$/.test(value.trim())) return setMiss('Type a row number.')
        const n = Number(value)
        setBusy(true)
        const id = await rowByNumber({ data: n }).finally(() => setBusy(false))
        if (!id) return setMiss(`No row ${n}. Rows go from 1 to ${last}.`)
        setMiss(null)
        setValue('')
        onOpen(id)
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
        className={cn(opsControl, 'w-20 tabular-nums')}
      />
      <button type="submit" disabled={busy} aria-label="Open row" className={cn(opsGhost, 'w-8 px-0')}>
        <CornerDownLeft aria-hidden />
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

/** A stored value as words: lists joined. */
export function valueText(v: unknown): string {
  if (v === null || v === undefined || v === '') return ''
  if (Array.isArray(v)) return v.map(valueText).filter(Boolean).join(', ')
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

/** A value in ink, or a quiet dash when there is none. */
export function Value({ v, className }: { v: unknown; className?: string }) {
  const t = valueText(v)
  return t ? <span className={cn('break-words text-ink', className)}>{t}</span> : <span className="text-ink-2">—</span>
}
