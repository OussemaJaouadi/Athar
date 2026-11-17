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
  // The list counts come with each download; only the selected download's changes are read.
  loader: async ({ deps }) => {
    const downloads = await listDownloads()
    const id = deps.download ?? downloads[0]?.id
    const changes = id ? await getDownloadChanges({ data: id }) : null
    return { downloads, id, changes }
  },
  component: ChangesPage,
})

const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
const n = (v: number) => v.toLocaleString('en-GB')
const plural = (v: number, one: string, many: string) => `${n(v)} ${v === 1 ? one : many}`

// Changes: what each download of the registry changed against the one before it. The first one is the baseline.
function ChangesPage() {
  const { downloads, id, changes } = Route.useLoaderData()
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
                    detail={d.id === baseline ? 'The first download: nothing to compare it with' : countLine(d)}
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

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const month = (labelled: string | null) => (labelled ? `${MONTHS[Number(labelled.slice(5, 7)) - 1]} ${labelled.slice(0, 4)}` : null)

/** "4 new · 2 edited · 1 no longer published": startups first seen, startups whose entry changed, startups dropped. */
function countLine(d: DownloadSummary) {
  return [`${n(d.startupsNew)} new`, `${n(d.startupsEdited)} edited`, `${n(d.startupsGone)} no longer published`].join(' · ')
}

function DownloadPane({ d, previous, changes, baseline, position }: { d: DownloadSummary; previous?: DownloadSummary; changes: DownloadChange[]; baseline: boolean; position: string }) {
  const added = changes.filter((c) => c.kind === 'new startup' || c.kind === 'new listing of a known startup')
  const edited = changes.filter((c) => c.kind === 'edited')
  const dropped = changes.filter((c) => c.kind === 'startup withdrawn' || c.kind === 'withdrawn')

  return (
    <DeskPane
      title={`Download ${d.id} · ${day(d.fetchedAt)}`}
      statement={
        baseline
          ? `${plural(d.rows, 'row', 'rows')}`
          : `${countLine(d)} · ${previous ? `${n(previous.rows)} → ${n(d.rows)} rows` : `${n(d.rows)} rows`}`
      }
      position={position}
    >
      {baseline ? (
        <p className="max-w-[72ch] text-[0.875rem] leading-6 text-ink">
          This is the first download, so there is nothing to compare it with. {plural(d.entriesNew, 'entry', 'entries')}, {plural(d.startupsNew, 'startup', 'startups')}.
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
              <ChangeTable
                rows={added}
                note={(r) =>
                  [r.sector, month(r.labelled) && `labelled ${month(r.labelled)}`, r.kind === 'new listing of a known startup' ? 'another listing of a startup already in Athar' : null]
                    .filter(Boolean)
                    .join(' · ')
                }
              />
            </PaneSection>
          )}
          {edited.length > 0 && (
            <PaneSection title={`Edited · ${n(edited.length)}`}>
              <div className="grid gap-5">
                {edited.map((r) => (
                  <EditedBlock key={r.entryId} r={r} />
                ))}
              </div>
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

/** One edited startup: its name and new entry, then only the fields that read differently, before and after. */
function EditedBlock({ r }: { r: DownloadChange }) {
  const diffs = r.differences ?? []
  const cell = 'border-b border-hairline px-3 py-2 text-[0.875rem] [overflow-wrap:anywhere] text-ink'
  return (
    <div className="grid gap-2">
      <p className="flex flex-wrap items-baseline gap-x-3 text-[0.875rem]">
        {r.startupId ? (
          <StartupLink id={r.startupId} className="font-medium text-glaze underline">
            <span dir="auto">{r.startupName ?? r.name}</span>
          </StartupLink>
        ) : (
          <span dir="auto" className="font-medium">
            {r.name}
          </span>
        )}
        <Link to="/portal/startups" search={{ entry: r.entryId }} className="font-mono text-[0.8125rem] text-glaze underline">
          entry {r.entryId}
        </Link>
      </p>
      {diffs.length ? (
        <div role="table" className="grid grid-cols-[150px_minmax(0,1fr)_minmax(0,1fr)] border border-edge">
          <div role="row" className="contents">
            {['Field', 'Before', 'After'].map((h) => (
              <div role="columnheader" key={h} className="border-b border-edge px-3 py-2 text-[0.8125rem] text-ink-2">
                {h}
              </div>
            ))}
          </div>
          {diffs.map((f) => (
            <div role="row" key={f.field} className="contents">
              <div role="cell" className={cell}>
                {f.field}
              </div>
              <div role="cell" className={cell} dir="auto">
                {f.before ?? <span className="text-ink-3">empty</span>}
              </div>
              <div role="cell" className={cell} dir="auto">
                {f.after ?? <span className="text-ink-3">empty</span>}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-[0.875rem] text-ink">The new row reads the same in every field Athar uses.</p>
      )}
    </div>
  )
}
