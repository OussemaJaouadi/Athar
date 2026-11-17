import { Link } from '@tanstack/react-router'
import { ExternalLink, Route as RouteIcon } from 'lucide-react'

import { FieldList, OpsDrawer, opsGhost, type Field } from '@/components/athar/ops'
import type { DbRow, DbValue } from '#/server/api/database'

export type DbColumn = { name: string; type: string; blob: boolean; secret: boolean }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Human names for the tables an operator meets; the raw name stays as a tooltip. */
export const TABLE_NAMES: Record<string, string> = {
  source_snapshots: 'Snapshots',
  source_rows: 'Source rows',
  records: 'Records',
  startups: 'Startups',
  review_items: 'Findings',
  runs: 'Runs',
  run_steps: 'Run steps',
  ai_keys: 'AI keys',
  ai_usage: 'AI usage',
  embedding_meta: 'Embedding meta',
  prepared_texts: 'Prepared texts',
  schema_migrations: 'Migrations',
}

/** "identity_key" → "Identity key"; "founders_json" → "Founders"; "id" → "ID". */
export function humanize(col: string) {
  const words = col.replace(/_json$/, '').split('_').filter(Boolean)
  const s = words.map((w) => (w === 'id' ? 'ID' : w === 'url' ? 'URL' : w)).join(' ')
  return s.charAt(0).toUpperCase() + s.slice(1)
}
export const tableName = (t: string) => TABLE_NAMES[t] ?? humanize(t)

/** Columns read as code: ids, hashes, JSON. Everything else is prose. */
export const isMono = (name: string, v?: DbValue) =>
  name === 'id' || name.endsWith('_id') || name.endsWith('_json') || name.endsWith('_hash') || (typeof v === 'string' && UUID.test(v))

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

/** How a value reads in one grid cell: short, single line. The drawer shows it in full. */
export function cellText(col: DbColumn, v: DbValue): string {
  if (v === null) return '—'
  if (col.secret) return '••••'
  if (col.blob) return `${(Number(v) / 1024).toFixed(0)} KB`
  if (typeof v === 'number') return String(v)
  if (UUID.test(v)) return `…${v.slice(-8)}`
  const json = asJson(v)
  const text = json !== null ? JSON.stringify(json) : v
  return text.length > 90 ? `${text.slice(0, 90)}…` : text
}

/** What to call a row: its name when it has one, else its row number, else its short key. */
export function rowTitle(row: DbRow | null, key: string) {
  const s = (k: string) => (row && row[k] !== null && row[k] !== undefined ? String(row[k]) : null)
  return s('name') ?? (s('row_number') ? `Row ${s('row_number')}` : null) ?? (UUID.test(key) ? `…${key.slice(-8)}` : `Row ${key}`)
}

// Where a row leads: its source row's trace, its startup's profile.
function links(table: string, row: DbRow) {
  const s = (k: string) => (typeof row[k] === 'string' ? (row[k] as string) : null)
  const trace = table === 'source_rows' ? s('id') : ['records', 'review_items'].includes(table) ? s('source_row_id') : null
  const profile = table === 'startups' ? s('id') : ['records', 'review_items'].includes(table) ? s('startup_id') : null
  return { trace, profile }
}

function fieldOf(c: DbColumn, v: DbValue): Field {
  const label = humanize(c.name)
  if (v === null) return { label, value: <span className="text-ink-2">Empty</span> }
  if (c.secret) return { label, value: 'Hidden. Key values never leave the server.' }
  if (c.blob) return { label, value: `Binary, ${(Number(v) / 1024).toFixed(0)} KB. Not shown.` }
  const json = asJson(v)
  if (json !== null) {
    const pretty = JSON.stringify(json, null, 2)
    return {
      label,
      block: true,
      copy: pretty,
      value: (
        <pre className="max-h-80 overflow-auto rounded-md border border-edge bg-canvas p-2.5 font-mono text-[0.8125rem] leading-5 whitespace-pre-wrap break-words text-ink">
          {pretty}
        </pre>
      ),
    }
  }
  const long = typeof v === 'string' && v.length > 80
  return {
    label,
    copy: String(v),
    mono: isMono(c.name, v),
    block: long,
    value: (
      <span className={long ? 'leading-6 whitespace-pre-wrap' : typeof v === 'number' ? 'tabular-nums' : undefined}>
        {typeof v === 'number' ? String(v) : v}
      </span>
    ),
  }
}

/** One row in full, in the portal drawer: a calm label/value list, copy on hover, the ways out to Trace and the profile. */
export function DbDrawer({
  table,
  columns,
  row,
  missing,
  rowKey,
  onClose,
}: {
  table: string
  columns: DbColumn[]
  row: DbRow | null
  missing?: boolean
  rowKey: string | undefined
  onClose: () => void
}) {
  const to = row ? links(table, row) : { trace: null, profile: null }
  return (
    <OpsDrawer
      open={Boolean(rowKey)}
      onOpenChange={(o) => !o && onClose()}
      storageKey="database"
      defaultWidth={560}
      eyebrow={tableName(table)}
      title={rowKey ? rowTitle(row, rowKey) : ''}
      itemKey={rowKey}
      actions={
        <>
          {to.trace && (
            <Link to="/portal/trace/$rowId" params={{ rowId: to.trace }} className={`${opsGhost} no-underline`}>
              <RouteIcon aria-hidden />
              Trace this row
            </Link>
          )}
          {to.profile && (
            <Link to="/startups/$id" params={{ id: to.profile }} className={`${opsGhost} no-underline`}>
              <ExternalLink aria-hidden />
              Open profile
            </Link>
          )}
        </>
      }
    >
      {row ? (
        <FieldList fields={columns.map((c) => fieldOf(c, row[c.name] ?? null))} />
      ) : (
        <p className="text-[0.8125rem] text-ink">
          {missing ? (
            <>
              No row in {tableName(table)} has the key <span className="font-mono">{rowKey}</span>.
            </>
          ) : (
            'Loading the row…'
          )}
        </p>
      )}
    </OpsDrawer>
  )
}
