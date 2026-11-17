import { Link } from '@tanstack/react-router'
import { ExternalLink, Route as RouteIcon, X } from 'lucide-react'
import { useEffect, useRef } from 'react'

import { DbCopy } from '@/components/athar/db-copy'
import { Scroller } from '@/components/athar/scroller'
import type { DbRow, DbValue } from '#/server/api/database'

export type DbColumn = { name: string; type: string; blob: boolean; secret: boolean }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** A JSON value parsed for display, or null when the text is not JSON. */
export function asJson(v: DbValue): unknown {
  if (typeof v !== 'string') return null
  const t = v.trim()
  if (!(t.startsWith('{') || t.startsWith('['))) return null
  try {
    return JSON.parse(t)
  } catch {
    return null
  }
}

/** How a value reads in one grid cell: short, single line. The panel shows it in full. */
export function cellText(col: DbColumn, v: DbValue): string {
  if (v === null) return '—'
  if (col.secret) return '••••'
  if (col.blob) return `${(Number(v) / 1024).toFixed(0)} KB`
  if (typeof v === 'number') return v.toLocaleString('en-GB')
  if (UUID.test(v)) return `…${v.slice(-8)}`
  const json = asJson(v)
  const text = json !== null ? JSON.stringify(json) : v
  return text.length > 90 ? `${text.slice(0, 90)}…` : text
}

// Where a row leads: its source row's trace, its startup's profile.
function links(table: string, row: DbRow) {
  const s = (k: string) => (typeof row[k] === 'string' ? (row[k] as string) : null)
  const trace = table === 'source_rows' ? s('id') : ['records', 'review_items'].includes(table) ? s('source_row_id') : null
  const profile = table === 'startups' ? s('id') : ['records', 'review_items'].includes(table) ? s('startup_id') : null
  return { trace, profile }
}

/** One row in full: every field, JSON pretty-printed, a copy button on each, and the ways out to Trace and the profile. */
export function DbPanel({ table, columns, row, missing, rowKey, onClose }: { table: string; columns: DbColumn[]; row: DbRow | null; missing?: boolean; rowKey: string; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const to = row ? links(table, row) : { trace: null, profile: null }
  return (
    <>
      <div aria-hidden className="fixed inset-0 z-40 bg-canvas/60" onClick={onClose} />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="db-panel-h"
        className="fixed inset-y-0 end-0 z-50 flex w-[min(42rem,100vw)] flex-col border-s border-edge bg-canvas shadow-[0_0_48px_-12px_rgb(0_0_0/0.5)]"
      >
        <header className="flex items-start justify-between gap-4 border-b border-edge px-6 py-5">
          <div className="grid min-w-0 gap-1">
            <p className="text-[0.8125rem] text-ink-2">
              <span className="font-mono">{table}</span>
            </p>
            <h2 id="db-panel-h" className="truncate font-mono text-[1.125rem] text-ink">
              {rowKey}
            </h2>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close the row"
            className="inline-grid size-9 shrink-0 place-items-center rounded-md border border-edge text-ink hover:bg-surface-raised"
          >
            <X className="size-4" aria-hidden />
          </button>
        </header>
        {(to.trace || to.profile) && (
          <div className="flex flex-wrap gap-2 border-b border-edge px-6 py-3">
            {to.trace && (
              <Link
                to="/portal/trace/$rowId"
                params={{ rowId: to.trace }}
                className="inline-flex h-9 items-center gap-2 rounded-md border border-edge px-3 text-[0.875rem] text-ink no-underline hover:bg-surface-raised"
              >
                <RouteIcon className="size-4" aria-hidden />
                Trace this row
              </Link>
            )}
            {to.profile && (
              <Link
                to="/startups/$id"
                params={{ id: to.profile }}
                className="inline-flex h-9 items-center gap-2 rounded-md border border-edge px-3 text-[0.875rem] text-ink no-underline hover:bg-surface-raised"
              >
                <ExternalLink className="size-4" aria-hidden />
                Open profile
              </Link>
            )}
          </div>
        )}
        <Scroller className="flex-1" label="Row fields">
          {row ? (
            <dl className="grid gap-5 px-6 py-5">
              {columns.map((c) => {
                const v = row[c.name] ?? null
                const json = asJson(v)
                const full = v === null ? '' : c.blob ? `${v} bytes` : json !== null ? JSON.stringify(json, null, 2) : String(v)
                return (
                  <div key={c.name} className="grid gap-1.5">
                    <div className="flex items-center justify-between gap-3">
                      <dt className="font-mono text-[0.8125rem] text-ink-2">
                        {c.name} <span className="ms-1 font-sans">{c.type.toLowerCase()}</span>
                      </dt>
                      {v !== null && !c.secret && <DbCopy value={full} label={`Copy ${c.name}`} />}
                    </div>
                    <dd className="min-w-0">
                      {v === null ? (
                        <span className="text-ink">Empty</span>
                      ) : c.secret ? (
                        <span className="text-ink">Hidden. Key values never leave the server.</span>
                      ) : json !== null ? (
                        <pre className="overflow-x-auto rounded-md border border-edge bg-surface p-3 font-mono text-[0.8125rem] leading-5 whitespace-pre-wrap break-words text-ink">{full}</pre>
                      ) : c.blob ? (
                        <span className="text-ink">
                          Binary, {Number(v).toLocaleString('en-GB')} bytes ({(Number(v) / 1024).toFixed(0)} KB). Not shown.
                        </span>
                      ) : (
                        <p className={`text-[0.9375rem] leading-6 whitespace-pre-wrap break-words text-ink ${typeof v === 'number' || UUID.test(String(v)) ? 'font-mono tabular-nums' : ''}`}>{full}</p>
                      )}
                    </dd>
                  </div>
                )
              })}
            </dl>
          ) : (
            <p className="px-6 py-5 text-ink">
              {missing ? (
                <>
                  No row in <span className="font-mono">{table}</span> has the key <span className="font-mono">{rowKey}</span>.
                </>
              ) : (
                'Loading the row…'
              )}
            </p>
          )}
        </Scroller>
      </aside>
    </>
  )
}
