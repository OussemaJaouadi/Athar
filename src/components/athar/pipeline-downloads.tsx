import { Link } from '@tanstack/react-router'
import { ChevronLeft } from 'lucide-react'

import { deskTd, deskTh } from '@/components/athar/desk'
import { StartupLink } from '@/components/athar/startup-glimpse'
import { Disclosure } from '@/components/athar/startup-title'
import { cn } from '@/lib/utils'
import type { DownloadChange, DownloadSummary } from '#/server/pipeline/facts'

const dateOnly = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
const n = (v: number) => v.toLocaleString('en-GB')

const KINDS: DownloadChange['kind'][] = ['new startup', 'new listing of a known startup', 'edited', 'withdrawn', 'startup withdrawn']
const KIND_LABEL: Record<DownloadChange['kind'], [string, string]> = {
  'new startup': ['new startup', 'new startups'],
  'new listing of a known startup': ['new listing of a known startup', 'new listings of known startups'],
  edited: ['edited entry', 'edited entries'],
  withdrawn: ['entry no longer published', 'entries no longer published'],
  'startup withdrawn': ['startup no longer in the registry', 'startups no longer in the registry'],
}

/** The registry's downloads, newest first; a row opens what that download changed. */
export function DownloadList({ downloads, onOpen }: { downloads: DownloadSummary[]; onOpen: (id: number) => void }) {
  if (!downloads.length) return <p className="text-[0.875rem] text-ink">Nothing downloaded yet.</p>
  const first = Math.min(...downloads.map((d) => d.id))
  return (
    <div className="overflow-x-auto [scrollbar-width:thin] [scrollbar-color:var(--edge)_transparent]">
    <table className="w-full border-collapse tabular-nums">
      <thead>
        <tr>
          {['Download', 'Last checked', 'Rows', 'New entries', 'Entries gone', 'Startups new', 'Startups gone'].map((h) => (
            <th key={h} scope="col" className={deskTh}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {downloads.map((d) => (
          <tr key={d.id} className="cursor-pointer hover:bg-surface" onClick={() => onOpen(d.id)}>
            <td className={deskTd}>
              <button type="button" className="text-start text-glaze underline" onClick={() => onOpen(d.id)}>
                {dateOnly(d.fetchedAt)}
              </button>
              {d.id === first && <span className="ms-2 text-[0.8125rem] text-ink-2">baseline</span>}
            </td>
            <td className={deskTd}>{dateOnly(d.lastCheckedAt)}</td>
            <td className={deskTd}>{n(d.rows)}</td>
            <td className={deskTd}>{n(d.entriesNew)}</td>
            <td className={deskTd}>{d.id === first ? '—' : n(d.entriesGone)}</td>
            <td className={deskTd}>{n(d.startupsNew)}</td>
            <td className={deskTd}>{d.id === first ? '—' : n(d.startupsGone)}</td>
          </tr>
        ))}
      </tbody>
    </table>
    </div>
  )
}

function ChangeRows({ rows }: { rows: DownloadChange[] }) {
  return (
    <table className="w-full border-collapse">
      <thead>
        <tr>
          <th scope="col" className={deskTh}>
            Entry
          </th>
          <th scope="col" className={deskTh}>
            Startup
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={`${r.kind}-${r.entryId}`}>
            <td className={cn(deskTd, 'w-1/2')}>
              <Link to="/portal/startups" search={{ entry: r.entryId }} className="text-glaze underline">
                <span dir="auto">{r.name}</span>
              </Link>
              <span className="ms-2 font-mono text-[0.8125rem] text-ink-2">{r.entryId.slice(0, 8)}</span>
            </td>
            <td className={deskTd}>
              {r.startupId && r.startupName ? (
                <StartupLink id={r.startupId} className="text-glaze underline">
                  <span dir="auto">{r.startupName}</span>
                </StartupLink>
              ) : (
                <span className="text-ink-3">—</span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/**
 * What one download changed against the one before it, grouped by kind. The first download is the baseline: every
 * entry in it is new, so it is told as counts, with the rows behind a closed list.
 */
export function DownloadChanges({
  download,
  changes,
  baseline,
  onBack,
}: {
  download: DownloadSummary | undefined
  changes: DownloadChange[] | null
  baseline: boolean
  onBack: () => void
}) {
  const back = (
    <button type="button" onClick={onBack} className="inline-flex items-center gap-1 text-[0.875rem] text-glaze underline">
      <ChevronLeft className="size-4" aria-hidden />
      Back to the step
    </button>
  )
  if (!changes || !download)
    return (
      <div className="grid gap-3">
        {back}
        <p className="text-[0.875rem] text-ink">There is no such download.</p>
      </div>
    )
  const groups = KINDS.map((k) => ({ kind: k, rows: changes.filter((c) => c.kind === k) })).filter((g) => g.rows.length > 0)
  return (
    <div className="grid gap-4">
      {back}
      <div className="grid gap-1">
        <h3 className="font-sans text-[0.9375rem] font-medium text-ink">Download of {dateOnly(download.fetchedAt)}</h3>
        <p className="text-[0.875rem] text-ink">
          {n(download.rows)} rows · last checked {dateOnly(download.lastCheckedAt)}
          {baseline ? '. The first download: every entry is new.' : ''}
        </p>
      </div>
      {groups.length === 0 ? (
        <p className="text-[0.875rem] text-ink">This download changed nothing against the one before it.</p>
      ) : baseline ? (
        <ul className="grid">
          {groups.map((g) => (
            <li key={g.kind}>
              <Disclosure
                summary={
                  <>
                    <span className="tabular-nums">{n(g.rows.length)}</span> {KIND_LABEL[g.kind][g.rows.length === 1 ? 0 : 1]}
                  </>
                }
              >
                <ChangeRows rows={g.rows} />
              </Disclosure>
            </li>
          ))}
        </ul>
      ) : (
        groups.map((g) => (
          <section key={g.kind} className="grid gap-1.5">
            <h4 className="font-sans text-[0.8125rem] font-medium text-ink-2">
              <span className="tabular-nums">{n(g.rows.length)}</span> {KIND_LABEL[g.kind][g.rows.length === 1 ? 0 : 1]}
            </h4>
            <ChangeRows rows={g.rows} />
          </section>
        ))
      )}
    </div>
  )
}
