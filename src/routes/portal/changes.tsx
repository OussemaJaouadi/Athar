import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { useCallback } from 'react'

import { Desk, DeskBar, DeskEmpty, DeskGroup, DeskItem, DeskPane, PaneSection, deskTd, deskTh, useDeskKeys } from '@/components/athar/desk'
import { StartupLink } from '@/components/athar/startup-glimpse'
import { getDownloadChanges, listDownloads } from '#/server/api/ops'
import type { DownloadChange, DownloadSummary } from '#/server/pipeline/facts'

type Search = { download?: number }

export const Route = createFileRoute('/portal/changes')({
  validateSearch: (s: Record<string, unknown>): Search => {
    const d = Number(s.download)
    return { download: Number.isInteger(d) && d > 0 ? d : undefined }
  },
  loaderDeps: ({ search }) => ({ download: search.download }),
  // Every download's changes load with the list (there are few), so each item can count what it changed.
  loader: async ({ deps }) => {
    const downloads = await listDownloads()
    const all = await Promise.all(downloads.map((d) => getDownloadChanges({ data: d.id }).then((c) => [d.id, c ?? []] as const)))
    const byId = Object.fromEntries(all) as Record<number, DownloadChange[]>
    const id = deps.download ?? downloads[0]?.id
    return { downloads, id, byId }
  },
  component: ChangesPage,
})

const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
const n = (v: number) => v.toLocaleString('en-GB')
const plural = (v: number, one: string, many: string) => `${n(v)} ${v === 1 ? one : many}`

// Changes: what each download of the registry changed against the one before it. The first one is the baseline.
function ChangesPage() {
  const { downloads, id, byId } = Route.useLoaderData()
  const changes = id ? byId[id] : undefined
  const search = Route.useSearch()
  const navigate = useNavigate({ from: '/portal/changes' })
  const ids = downloads.map((d) => String(d.id))
  const baseline = downloads.length ? Math.min(...downloads.map((d) => d.id)) : undefined
  const select = useCallback((d: string) => navigate({ search: { download: Number(d) }, replace: true }), [navigate])
  useDeskKeys({ ids, current: id ? String(id) : undefined, select })
  const latest = downloads[0]
  const selected = downloads.find((d) => d.id === id)

  return (
    <main className="flex min-h-0 flex-1 flex-col">
      <DeskBar
        title="Changes"
        facts={
          latest
            ? `${plural(downloads.length, 'download', 'downloads')} · the registry was last compared on ${day(latest.lastCheckedAt)}`
            : 'Nothing downloaded yet'
        }
      />
      <Desk
        storageKey="changes"
        showPaneOnNarrow={!!search.download}
        onBack={() => navigate({ search: {}, replace: true })}
        backLabel="All downloads"
        list={
          downloads.length ? (
            <div role="list" aria-label="Downloads">
              <DeskGroup label="Downloads" count={downloads.length} />
              {downloads.map((d) => (
                <div role="listitem" key={d.id}>
                  <DeskItem
                    selected={d.id === id}
                    onSelect={() => select(String(d.id))}
                    title={`Download ${d.id} · ${day(d.fetchedAt)}`}
                    detail={d.id === baseline ? 'The first download: nothing to compare it with' : countLine(byId[d.id] ?? [])}
                  />
                </div>
              ))}
            </div>
          ) : (
            <p className="px-4 py-3 text-[0.875rem] text-ink">
              Nothing downloaded yet. Run Collect on{' '}
              <Link to="/portal" className="text-glaze underline">
                Status
              </Link>
              .
            </p>
          )
        }
        pane={
          selected && changes ? (
            <DownloadPane
              d={selected}
              previous={downloads.find((x) => x.id < selected.id)}
              changes={changes}
              baseline={selected.id === baseline}
              position={`${ids.indexOf(String(selected.id)) + 1} of ${ids.length}`}
            />
          ) : (
            <DeskEmpty>{downloads.length ? 'This download is not in the database.' : 'No download to show yet.'}</DeskEmpty>
          )
        }
      />
    </main>
  )
}

const count = (rows: DownloadChange[], ...kinds: DownloadChange['kind'][]) => rows.filter((r) => kinds.includes(r.kind)).length

/** "4 new · 2 edited · 1 no longer published": startups first seen, startups whose entry changed, startups dropped. */
function countLine(rows: DownloadChange[]) {
  const parts = [
    `${n(count(rows, 'new startup'))} new`,
    `${n(count(rows, 'edited'))} edited`,
    `${n(count(rows, 'startup withdrawn'))} no longer published`,
  ]
  return parts.join(' · ')
}

function DownloadPane({ d, previous, changes, baseline, position }: { d: DownloadSummary; previous?: DownloadSummary; changes: DownloadChange[]; baseline: boolean; position: string }) {
  const added = changes.filter((c) => c.kind === 'new startup' || c.kind === 'new listing of a known startup')
  const edited = changes.filter((c) => c.kind === 'edited')
  const dropped = changes.filter((c) => c.kind === 'startup withdrawn' || c.kind === 'withdrawn')
  const startupsNew = new Set(changes.filter((c) => c.kind === 'new startup').map((c) => c.startupId)).size

  return (
    <DeskPane
      title={`Download ${d.id} · ${day(d.fetchedAt)}`}
      statement={
        baseline
          ? `${plural(d.rows, 'row', 'rows')}`
          : `${countLine(changes)} · ${previous ? `${n(previous.rows)} → ${n(d.rows)} rows` : `${n(d.rows)} rows`}`
      }
      position={position}
    >
      {baseline ? (
        <p className="max-w-[72ch] text-[0.875rem] leading-6 text-ink">
          This is the first download, so there is nothing to compare it with. {plural(d.entriesNew, 'entry', 'entries')}, {plural(startupsNew || d.startupsNew, 'startup', 'startups')}.
          {d.lastCheckedAt !== d.fetchedAt && ` The registry was compared again on ${day(d.lastCheckedAt)} and published the same rows.`}
        </p>
      ) : (
        <>
          {d.lastCheckedAt !== d.fetchedAt && (
            <p className="text-[0.875rem] text-ink">The registry was compared again on {day(d.lastCheckedAt)} and published the same rows.</p>
          )}
          {!changes.length && <p className="text-[0.875rem] text-ink">Nothing changed against the download before it.</p>}
          {added.length > 0 && (
            <PaneSection title={`New · ${n(added.length)}`}>
              <ChangeTable rows={added} note={(r) => (r.kind === 'new listing of a known startup' ? 'another listing of a startup already in Athar' : null)} />
            </PaneSection>
          )}
          {edited.length > 0 && (
            <PaneSection title={`Edited · ${n(edited.length)}`}>
              <ChangeTable rows={edited} note={() => 'see the entry for the difference'} />
            </PaneSection>
          )}
          {dropped.length > 0 && (
            <PaneSection title={`No longer published · ${n(dropped.length)}`}>
              <ChangeTable
                rows={dropped}
                note={(r) => (r.kind === 'startup withdrawn' ? `kept in Athar, last published in download ${previous?.id ?? d.id - 1}` : 'one of its listings; the startup is still published')}
              />
            </PaneSection>
          )}
        </>
      )}
    </DeskPane>
  )
}

function ChangeTable({ rows, note }: { rows: DownloadChange[]; note?: (r: DownloadChange) => string | null }) {
  return (
    <table className="w-full border-collapse">
      <thead>
        <tr>
          {['Startup', 'Entry', ''].map((h) => (
            <th key={h} scope="col" className={deskTh}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={`${r.kind}:${r.entryId}`}>
            <td className={deskTd}>
              {r.startupId ? (
                <StartupLink id={r.startupId} className="text-glaze underline">
                  <span dir="auto">{r.startupName ?? r.name}</span>
                </StartupLink>
              ) : (
                <span dir="auto">{r.name}</span>
              )}
            </td>
            <td className={deskTd}>
              <Link to="/portal/startups" search={{ entry: r.entryId }} className="font-mono text-[0.8125rem] text-glaze underline">
                {r.entryId}
              </Link>
            </td>
            <td className={deskTd}>{note?.(r) ?? ''}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
