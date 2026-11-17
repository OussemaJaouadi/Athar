import { Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'

import { Fields, JsonBlock, PaneSection, isEmpty, type DeskField } from '@/components/athar/desk'
import { getDbRecord, type DbColumnInfo, type DbRecord, type DbRow, type DbValue } from '#/server/api/database'

export type DbColumn = DbColumnInfo

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ENTRY_ID = /^[0-9a-f]{12}$/
const LONG_HASH = /^[0-9a-f]{32,}$/i
const URLISH = /^(https?:|www\.)/i

/** Human names for the tables an operator meets; the raw name stays as a tooltip. */
export const TABLE_NAMES: Record<string, string> = {
  downloads: 'Downloads',
  entries: 'Entries',
  startups: 'Startups',
  runs: 'Runs',
  run_steps: 'Run steps',
  ai_keys: 'AI keys',
  ai_usage: 'AI usage',
  embedding_meta: 'Embedding meta',
  prepared_texts: 'Prepared texts',
}

// Column and registry keys that read better under another name.
const KEY_NAMES: Record<string, string> = {
  desc: 'Description',
  label: 'Label date',
  creation_year: 'Founded',
  logo_id: 'Logo ID',
  first_download: 'First download',
  last_download: 'Last download',
  row_count: 'Rows',
  byte_size: 'Size',
  copies: 'Copies',
}

/** "identity_key" → "Identity key"; "founders_json" → "Founders"; "id" → "ID". */
export function humanize(col: string) {
  if (KEY_NAMES[col]) return KEY_NAMES[col]
  const words = col.replace(/_json$/, '').split('_').filter(Boolean)
  const s = words.map((w) => (w === 'id' ? 'ID' : w === 'url' ? 'URL' : w)).join(' ')
  return s.charAt(0).toUpperCase() + s.slice(1)
}
export const tableName = (t: string) => TABLE_NAMES[t] ?? humanize(t)

/**
 * How an identifier reads: UUIDs as their last four characters, long hashes as their first twelve, an entry id (the
 * 12-character hash) and a startup slug in full. Null when the value is not an identifier.
 */
export function idText(name: string, v: DbValue): { text: string; mono: boolean; full: string } | null {
  if (typeof v !== 'string') return null
  if (UUID.test(v)) return { text: `…${v.slice(-4)}`, mono: true, full: v }
  if (LONG_HASH.test(v)) return { text: `${v.slice(0, 12)}…`, mono: true, full: v }
  if (ENTRY_ID.test(v) && (name === 'id' || name.endsWith('_id'))) return { text: v, mono: true, full: v }
  if (name === 'id' || name.endsWith('_id')) return { text: v, mono: false, full: v }
  return null
}
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

export const shortDate = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
const dateTime = (iso: string) => new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })

const display = (v: unknown): string | null => {
  if (isEmpty(v)) return null
  if (Array.isArray(v)) return v.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(', ')
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

function columnField(c: DbColumn, v: DbValue): DeskField {
  const label = humanize(c.name)
  if (c.secret) return { label, value: 'Hidden. Key values never leave the server.' }
  if (c.blob) return { label, value: v === null ? null : `Binary, ${(Number(v) / 1024).toFixed(0)} KB. Not shown.` }
  const json = asJson(v)
  if (json !== undefined) return { label, value: display(json) }
  const id = idText(c.name, v)
  if (id) return { label, value: <span title={id.full}>{id.text}</span>, mono: id.mono }
  return { label, value: v === null ? null : String(v), mono: isUrl(v) }
}

function useRecord(table: string, key: string | undefined) {
  const [state, setState] = useState<{ key: string; value: DbRecord } | null>(null)
  useEffect(() => {
    if (!key) return
    let live = true
    getDbRecord({ data: { table, key } })
      .then((value) => live && setState({ key, value }))
      .catch(() => live && setState({ key, value: { kind: 'missing' } }))
    return () => {
      live = false
    }
  }, [table, key])
  return state && state.key === key ? state.value : null
}

const linkCls = 'text-[0.875rem] text-glaze underline'

function CopyJson({ value, label }: { value: unknown; label: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <>
      <button
        type="button"
        className={linkCls}
        onClick={() => {
          navigator.clipboard
            ?.writeText(JSON.stringify(value, null, 2))
            .then(() => setCopied(true))
            .catch(() => setCopied(false))
        }}
      >
        {copied ? 'Copied' : 'Copy as JSON'}
      </button>
      <span className="sr-only" aria-live="polite">
        {copied ? `${label} copied as JSON` : ''}
      </span>
    </>
  )
}

function StartupLinks({ id }: { id: string }) {
  return (
    <>
      <Link to="/portal/trace" search={{ startup: id }} className={linkCls}>
        Trace this startup
      </Link>
      <Link to="/startups/$id" params={{ id }} className={linkCls}>
        Open the startup profile
      </Link>
    </>
  )
}

const Links = ({ children }: { children: React.ReactNode }) => <p className="flex flex-wrap gap-x-[18px] gap-y-1">{children}</p>

/**
 * The record pane, by table. An entry is its raw row once (as shown on screen, never the verbatim text), then where it
 * was seen and the startup it belongs to. A startup is its seven fields, its notes as plain facts and when the
 * registry listed it. A download is its dates and counts. Other tables read as labelled fields.
 */
export function RecordPane({ table, rowKey }: { table: string; rowKey: string | undefined }) {
  const rec = useRecord(table, rowKey)

  if (!rowKey) return <p className="text-[0.875rem] text-ink">This table is empty.</p>
  if (!rec) return <p className="text-[0.875rem] text-ink">Loading the row…</p>
  if (rec.kind === 'missing')
    return (
      <p className="text-[0.875rem] text-ink">
        No row in {tableName(table)} has the key <span className="font-mono">{rowKey}</span>.
      </p>
    )

  if (rec.kind === 'entry')
    return (
      <>
        <PaneSection title={<>Entry <span className="font-mono">{rec.id}</span>{rec.row?.name ? `, ${rec.row.name}` : ''}</>}>
          <Links>
            {rec.startup && <StartupLinks id={rec.startup.id} />}
            {rec.row && <CopyJson value={rec.row} label="Entry" />}
          </Links>
        </PaneSection>
        {rec.row ? <JsonBlock title="As the registry published it" value={rec.row} /> : <p className="text-[0.875rem] text-ink">The stored row could not be read.</p>}
        <Fields
          fields={[
            {
              label: 'Listed',
              value: rec.copies === 1 ? 'Once per download' : `${rec.copies} identical copies in the same download, stored once`,
            },
            { label: 'First seen', value: rec.firstSeen ? `${shortDate(rec.firstSeen.at)} (download ${rec.firstSeen.download})` : null },
            { label: 'Last seen', value: rec.lastSeen ? `${shortDate(rec.lastSeen.at)} (download ${rec.lastSeen.download})` : null },
            {
              label: 'Startup',
              value: rec.startup ? (
                <Link to="/portal/database" search={{ table: 'startups', row: rec.startup.id }} className="text-glaze underline">
                  {rec.startup.name}
                </Link>
              ) : null,
            },
          ]}
        />
      </>
    )

  if (rec.kind === 'startup')
    return (
      <>
        <PaneSection title={rec.name}>
          <Links>
            <StartupLinks id={rec.id} />
            <CopyJson
              value={{
                id: rec.id,
                name: rec.name,
                description: rec.description,
                sector: rec.sector,
                website: rec.website,
                founders: rec.founders,
                cohort: rec.cohort,
                creation_year: rec.creationYear,
              }}
              label="Startup"
            />
          </Links>
        </PaneSection>
        <Fields
          fields={[
            { label: 'Name', value: rec.name },
            { label: 'Description', value: rec.description },
            { label: 'Sector', value: rec.sector },
            { label: 'Website', value: rec.website, mono: !!rec.website },
            { label: 'Founders', value: rec.founders.length ? rec.founders.join(', ') : null },
            { label: 'Label date', value: rec.cohort },
            { label: 'Founded', value: rec.creationYear === null ? null : String(rec.creationYear) },
          ]}
        />
        {rec.notes.length > 0 && (
          <PaneSection title="Notes">
            <ul className="grid gap-1 text-[0.875rem] text-ink">
              {rec.notes.map((n) => (
                <li key={n.code + n.text}>{n.text}</li>
              ))}
            </ul>
          </PaneSection>
        )}
        <PaneSection title="In the registry">
          <Fields
            fields={[
              { label: 'First seen', value: rec.firstSeen ? shortDate(rec.firstSeen.at) : null },
              {
                label: rec.withdrawnSince ? 'No longer listed' : 'Last seen',
                value: rec.withdrawnSince ? `Since ${shortDate(rec.withdrawnSince)}` : rec.lastSeen ? shortDate(rec.lastSeen.at) : null,
              },
              { label: 'Listed', value: rec.listings === 1 ? 'Once' : `${rec.listings} times` },
              {
                label: 'Read from',
                value: (
                  <Link to="/portal/database" search={{ table: 'entries', row: rec.entryId }} className="font-mono text-glaze underline">
                    entry {rec.entryId}
                  </Link>
                ),
              },
            ]}
          />
        </PaneSection>
      </>
    )

  if (rec.kind === 'download')
    return (
      <>
        <PaneSection title={`Downloaded ${shortDate(rec.fetchedAt)}`}>
          <Fields
            fields={[
              { label: 'Downloaded', value: dateTime(rec.fetchedAt) },
              { label: 'Last checked', value: dateTime(rec.lastCheckedAt) },
              { label: 'Rows', value: rec.rows.toLocaleString('en-GB') },
              { label: 'New entries', value: rec.entriesFirstSeen.toLocaleString('en-GB') },
              { label: 'Size', value: `${(rec.bytes / 1024).toFixed(0)} KB` },
              { label: 'From', value: rec.url, mono: true },
              { label: 'Content hash', value: <span title="First 12 characters of the hash over the set of rows">{rec.hash}…</span>, mono: true },
              {
                label: 'Run',
                value: rec.runId ? (
                  <Link to="/portal" search={{ run: rec.runId }} className="text-glaze underline">
                    Collect <span className="font-mono">{rec.runId.slice(-4)}</span>
                  </Link>
                ) : null,
              },
            ]}
          />
        </PaneSection>
      </>
    )

  const row: DbRow = rec.row
  const jsonCols = rec.columns.filter((c) => !c.secret && asJson(row[c.name] ?? null) !== undefined)
  const fields = rec.columns.filter((c) => !jsonCols.includes(c)).map((c) => columnField(c, row[c.name] ?? null))
  const plain = Object.fromEntries(rec.columns.map((c) => [c.name, c.secret ? '••••' : (asJson(row[c.name] ?? null) ?? row[c.name] ?? null)]))
  return (
    <>
      <PaneSection title={tableName(table)}>
        <Fields fields={fields} />
      </PaneSection>
      <Links>
        <CopyJson value={plain} label="Row" />
      </Links>
      {jsonCols.map((c) => (
        <JsonBlock key={c.name} title={humanize(c.name)} value={asJson(row[c.name] ?? null)} />
      ))}
    </>
  )
}
