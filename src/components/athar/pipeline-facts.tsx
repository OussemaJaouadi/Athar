import { Link } from '@tanstack/react-router'
import { Check, ChevronLeft, Copy } from 'lucide-react'
import { useState } from 'react'

import { deskBtn, deskTd, deskTh } from '@/components/athar/desk'
import { StartupLink } from '@/components/athar/startup-glimpse'
import { cn } from '@/lib/utils'
import type { FactRow } from '#/server/pipeline/facts'

// The counted facts that have rows behind them (getFactRows returns rows for these; null for every other code).
const ROW_CODES = new Set([
  'no_description',
  'listed_more_than_once',
  'other_sector',
  'other_name',
  'website_text_removed',
  'second_website',
  'website_unreadable',
  'label_unreadable',
  'label_before_creation',
  'not_in_registry',
  'reachable',
  'unreachable',
  'moved',
  'social_not_checked',
  'no_website',
  'from_prepared',
  'exact_copies',
])

/** Whether a counted fact can be opened as the list of startups or entries it counts. */
export const hasRows = (code: string) => ROW_CODES.has(code) || code.startsWith('unreachable:')

const dateOnly = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

const csvCell = (v: string | null) => (v === null ? '' : /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)

/**
 * The rows behind one counted fact, in place of the step pane's body: startup (with its hover preview) and the value
 * the fact is about. The list is read from the data as it is today, which can differ from what the run counted.
 */
export function FactList({
  label,
  counted,
  countedOn,
  result,
  onBack,
}: {
  label: string
  counted: number
  countedOn: string | null
  result: { rows: FactRow[]; total: number } | null
  onBack: () => void
}) {
  const [copied, setCopied] = useState(false)
  const back = (
    <button type="button" onClick={onBack} className="inline-flex items-center gap-1 text-[0.875rem] text-glaze underline">
      <ChevronLeft className="size-4" aria-hidden />
      Back to the step
    </button>
  )
  if (!result)
    return (
      <div className="grid gap-3">
        {back}
        <p className="text-[0.875rem] text-ink">This count has no list of rows behind it.</p>
      </div>
    )
  const { rows, total } = result
  return (
    <div className="grid gap-3">
      {back}
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h3 className="font-sans text-[0.9375rem] font-medium text-ink">
          <span className="tabular-nums">{total.toLocaleString('en-GB')}</span> {label}
        </h3>
        <button
          type="button"
          className={deskBtn}
          onClick={() => {
            const csv = ['startup,startup_id,value', ...rows.map((r) => [r.name, r.startupId, r.value].map(csvCell).join(','))].join('\n')
            navigator.clipboard
              ?.writeText(csv)
              .then(() => {
                setCopied(true)
                setTimeout(() => setCopied(false), 1500)
              })
              .catch(() => setCopied(false))
          }}
        >
          {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
          {copied ? 'Copied' : 'Copy as CSV'}
        </button>
      </div>
      <p className="text-[0.8125rem] text-ink-2">
        This list reads the data as it is today
        {countedOn ? `; the run counted ${counted.toLocaleString('en-GB')} on ${dateOnly(countedOn)}` : ''}.
        {rows.length < total && ` Showing ${rows.length.toLocaleString('en-GB')} of ${total.toLocaleString('en-GB')}.`}
      </p>
      {rows.length === 0 ? (
        <p className="text-[0.875rem] text-ink">Nothing in the data matches this any more.</p>
      ) : (
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th scope="col" className={deskTh}>
                Startup
              </th>
              <th scope="col" className={deskTh}>
                What
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={`${r.entryId ?? r.startupId ?? r.name}-${i}`}>
                <td className={cn(deskTd, 'w-[34%]')}>
                  {r.startupId ? (
                    <StartupLink id={r.startupId} className="text-glaze underline">
                      <span dir="auto">{r.name}</span>
                    </StartupLink>
                  ) : (
                    <span dir="auto">{r.name}</span>
                  )}
                  {r.entryId && (
                    <Link to="/portal/entries" search={{ entry: r.entryId }} className="ms-2 font-mono text-[0.8125rem] text-glaze underline">
                      {r.entryId.slice(0, 8)}
                    </Link>
                  )}
                </td>
                <td className={cn(deskTd, '[overflow-wrap:anywhere]')}>{r.value ?? <span className="text-ink-3">—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
