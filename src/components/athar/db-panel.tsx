import { Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'

import { Fields, JsonBlock, PaneSection, isEmpty, type DeskField } from '@/components/athar/desk'
import { getDbRecordContext, type DbRecordContext, type DbRow, type DbValue } from '#/server/api/database'

export type DbColumn = { name: string; type: string; blob: boolean; secret: boolean }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const URLISH = /^(https?:|www\.)/i

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

// Registry keys that read better under another name.
const KEY_NAMES: Record<string, string> = { desc: 'Description', label: 'Label date', creation_year: 'Founded', logo_id: 'Logo ID' }

/** "identity_key" → "Identity key"; "founders_json" → "Founders"; "id" → "ID". */
export function humanize(col: string) {
  if (KEY_NAMES[col]) return KEY_NAMES[col]
  const words = col.replace(/_json$/, '').split('_').filter(Boolean)
  const s = words.map((w) => (w === 'id' ? 'ID' : w === 'url' ? 'URL' : w)).join(' ')
  return s.charAt(0).toUpperCase() + s.slice(1)
}
export const tableName = (t: string) => TABLE_NAMES[t] ?? humanize(t)

/** Ids and hashes read as code. */
export const isId = (name: string, v?: DbValue) =>
  name === 'id' || name.endsWith('_id') || name.endsWith('_hash') || (typeof v === 'string' && UUID.test(v))
export const isUrl = (v: DbValue) => typeof v === 'string' && URLISH.test(v.trim())

/** A JSON value parsed for display, or undefined when the text is not JSON. */
export function asJson(v: DbValue): unknown {
  if (typeof v !== 'string') return undefined
  const t = v.trim()
  if (!(t.startsWith('{') || t.startsWith('['))) return undefined
  try {
    return JSON.parse(t)
  } catch {
    return undefined
  }
}

/** What to call a row: its row number (and registry name) when it has one, else its name, else its short key. */
export function rowTitle(row: DbRow | null, key: string) {
  const s = (k: string) => (row && row[k] !== null && row[k] !== undefined ? String(row[k]) : null)
  const raw = row ? asJson(row.raw_json ?? null) : undefined
  const rawName = raw && typeof raw === 'object' && 'name' in raw ? String((raw as { name: unknown }).name) : null
  if (s('row_number')) return `Row ${s('row_number')}${rawName ? ` · ${rawName}` : ''}`
  return s('name') ?? (UUID.test(key) ? `…${key.slice(-4)}` : `Row ${key}`)
}

const display = (v: unknown): string | null => {
  if (isEmpty(v)) return null
  if (Array.isArray(v)) return v.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(', ')
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}


function columnField(c: DbColumn, v: DbValue, flagged: string[]): DeskField {
  const label = humanize(c.name)
  if (c.secret) return { label, value: 'Hidden. Key values never leave the server.' }
  if (c.blob) return { label, value: v === null ? null : `Binary, ${(Number(v) / 1024).toFixed(0)} KB. Not shown.` }
  const json = asJson(v)
  if (json !== undefined) return { label, value: display(json) }
  return {
    label,
    value: v === null ? null : String(v),
    mono: isId(c.name, v) || isUrl(v),
    bad: flagged.includes(c.name) && !isEmpty(v),
  }
}

function useRecordContext(table: string, key: string | undefined) {
  const [ctx, setCtx] = useState<{ key: string; value: DbRecordContext } | null>(null)
  useEffect(() => {
    if (!key) return
    let live = true
    getDbRecordContext({ data: { table, key } })
      .then((value) => {
        if (live) setCtx({ key, value })
      })
      .catch(() => {
        if (live) setCtx({ key, value: { flagged: [], sourceRowId: null, startupId: null } })
      })
    return () => {
      live = false
    }
  }, [table, key])
  return ctx && ctx.key === key ? ctx.value : null
}

/**
 * The record pane: the row read as labelled fields first, then the ways out (Trace, profile, copy), then the raw JSON
 * in the code block. Source rows read as the registry gave them, from raw_json.
 */
export function RecordPane({
  table,
  columns,
  row,
  rowKey,
  missing,
}: {
  table: string
  columns: DbColumn[]
  row: DbRow | null
  rowKey: string | undefined
  missing: boolean
}) {
  const ctx = useRecordContext(table, row ? rowKey : undefined)
  const [copied, setCopied] = useState(false)
  useEffect(() => setCopied(false), [rowKey])

  if (!rowKey) return <p className="text-[0.875rem] text-ink">This table is empty.</p>
  if (!row)
    return (
      <p className="text-[0.875rem] text-ink">
        {missing ? (
          <>
            No row in {tableName(table)} has the key <span className="font-mono">{rowKey}</span>.
          </>
        ) : (
          'Loading the row…'
        )}
      </p>
    )

  const flagged = ctx?.flagged ?? []
  const jsonCols = columns.filter((c) => !c.secret && asJson(row[c.name] ?? null) !== undefined)
  const raw = table === 'source_rows' ? asJson(row.raw_json ?? null) : undefined
  const isRecord = raw !== undefined && raw !== null && typeof raw === 'object' && !Array.isArray(raw)
  // Internal ids (UUIDs) are plumbing: the links below navigate, so they are not shown as fields.
  const isId = (name: string) => {
    const v = row[name]
    return (name === 'id' || name.endsWith('_id')) && typeof v === 'string' && /^[0-9a-f-]{32,36}$/i.test(v)
  }
  // A source row is the raw download: shown once, as its JSON, never again as parsed fields.
  const fields: DeskField[] = isRecord
    ? []
    : columns.filter((c) => !jsonCols.includes(c) && !isId(c.name)).map((c) => columnField(c, row[c.name] ?? null, flagged))
  const stored: DeskField[] = []

  const plain = Object.fromEntries(columns.map((c) => [c.name, c.secret ? '••••' : (asJson(row[c.name] ?? null) ?? row[c.name] ?? null)]))
  const trace = ctx?.sourceRowId ?? null
  const profile = ctx?.startupId ?? null
  const link = 'text-[0.875rem] text-glaze underline'

  return (
    <>
      {fields.length > 0 && (
        <PaneSection title={rowTitle(row, rowKey)}>
          <Fields fields={fields} />
        </PaneSection>
      )}
      <p className="flex flex-wrap gap-x-[18px] gap-y-1">
        {trace && (
          <Link to="/portal/trace" search={{ row: trace }} className={link}>
            Trace this row
          </Link>
        )}
        {profile && (
          <Link to="/startups/$id" params={{ id: profile }} className={link}>
            Open the startup profile
          </Link>
        )}
        <button
          type="button"
          className={link}
          onClick={() => {
            navigator.clipboard
              ?.writeText(JSON.stringify(plain, null, 2))
              .then(() => setCopied(true))
              .catch(() => setCopied(false))
          }}
        >
          {copied ? 'Copied' : 'Copy as JSON'}
        </button>
        <span className="sr-only" aria-live="polite">
          {copied ? 'Row copied as JSON' : ''}
        </span>
      </p>
      {jsonCols.map((c) => (
        <JsonBlock key={c.name} title={c.name} value={asJson(row[c.name] ?? null)} />
      ))}
      {stored.length > 0 && (
        <PaneSection title="Stored with it">
          <Fields fields={stored} />
        </PaneSection>
      )}
    </>
  )
}
