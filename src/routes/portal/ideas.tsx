import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { useCallback } from 'react'

import { SegmentedControl } from '@/components/interior/segmented-control'
import { Desk, DeskBar, DeskEmpty, DeskItem, DeskPane, PaneSection, deskTd, deskTh, useDeskKeys } from '@/components/athar/desk'
import { StartupLink } from '@/components/athar/startup-glimpse'
import { cn } from '@/lib/utils'
import { getIdeaCheckRow, listIdeaChecks } from '#/server/api/ops'
import type { IdeaCheckMatch, IdeaCheckRow } from '#/server/pipeline/facts'

// view: the checks the visitor chose to save, or the recent ones they did not. show: only those with nothing close.
type View = 'saved' | 'recent'
type Search = { idea?: string; view?: View; show?: 'nothing' }

export const Route = createFileRoute('/portal/ideas')({
  validateSearch: (s: Record<string, unknown>): Search => ({
    idea: typeof s.idea === 'string' && s.idea ? s.idea : undefined,
    // An older link with show=saved still opens the saved view.
    view: s.view === 'saved' || s.view === 'recent' ? s.view : s.show === 'saved' ? 'saved' : undefined,
    show: s.show === 'nothing' ? 'nothing' : undefined,
  }),
  loaderDeps: ({ search }) => ({ idea: search.idea }),
  // Every stored check, newest first; a check linked from elsewhere is fetched on its own when it is older than the list.
  loader: async ({ deps }) => {
    const ideas = await listIdeaChecks({ data: { savedOnly: false, limit: 500 } })
    const linked = deps.idea && !ideas.some((i) => i.id === deps.idea) ? await getIdeaCheckRow({ data: deps.idea }) : null
    return { ideas, linked }
  },
  component: IdeasPage,
})

const LANGUAGE: Record<string, string> = { en: 'English', fr: 'French', ar: 'Arabic' }
const languageName = (code: string | null) => (code ? (LANGUAGE[code] ?? code) : 'language not read')
const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
const closeWords = (n: number) => (n === 0 ? 'nothing close' : `${n} close`)

// Ideas: what people look for, and where the registry has nothing close to it.
function IdeasPage() {
  const { ideas, linked } = Route.useLoaderData()
  const search = Route.useSearch()
  const navigate = useNavigate({ from: '/portal/ideas' })

  const savedAll = ideas.filter((i) => i.saved)
  const recentAll = ideas.filter((i) => !i.saved)
  // A linked check opens in the view it belongs to; otherwise Saved, or Recent when nothing was saved.
  const linkedCheck = search.idea ? (ideas.find((i) => i.id === search.idea) ?? (linked?.id === search.idea ? linked : undefined)) : undefined
  const view: View = search.view ?? (linkedCheck ? (linkedCheck.saved ? 'saved' : 'recent') : savedAll.length ? 'saved' : 'recent')
  const inView = view === 'saved' ? savedAll : recentAll
  const nothing = inView.filter((i) => i.close.length === 0).length
  const shown = search.show === 'nothing' ? inView.filter((i) => i.close.length === 0) : inView
  const current = search.idea ?? shown[0]?.id
  const selected = shown.find((i) => i.id === current) ?? ideas.find((i) => i.id === current) ?? (linked && linked.id === current ? linked : undefined)
  const ids = shown.map((i) => i.id)

  const select = useCallback((id: string) => navigate({ search: (s) => ({ ...s, idea: id }), replace: true }), [navigate])
  useDeskKeys({ ids, current, select })

  const nothingOn = search.show === 'nothing'
  return (
    <main className="flex min-h-0 flex-1 flex-col">
      <DeskBar title="Ideas" facts={ideas.length ? `${savedAll.length} saved · ${recentAll.length} recent · ${ideas.filter((i) => i.close.length === 0).length} found nothing close` : 'No idea checked yet'}>
        {ideas.length > 0 && (
          <>
            <SegmentedControl
              label="Which idea checks"
              value={view}
              onValueChange={(v) => navigate({ search: (s) => ({ ...s, view: v as View, idea: undefined }), replace: true })}
              options={[
                { value: 'saved', label: `Saved ${savedAll.length}` },
                { value: 'recent', label: `Recent ${recentAll.length}` },
              ]}
            />
            <button
              type="button"
              aria-pressed={nothingOn}
              onClick={() => navigate({ search: (s) => ({ ...s, show: nothingOn ? undefined : 'nothing', idea: undefined }), replace: true })}
              className={cn(
                'inline-flex h-8 items-center gap-1.5 rounded-[5px] border border-edge px-2.5 text-[0.875rem] whitespace-nowrap text-ink',
                nothingOn ? 'bg-surface-raised shadow-[inset_0_-2px_0_var(--ink)]' : 'hover:bg-surface',
              )}
            >
              Nothing close <span className="tabular-nums">{nothing}</span>
            </button>
          </>
        )}
      </DeskBar>
      {ideas.length === 0 && !linked ? (
        <DeskEmpty>
          <span className="grid justify-items-center gap-2">
            <span>No idea has been checked yet. Ideas typed on the home page or /idea appear here.</span>
            <Link to="/" className="text-glaze underline">
              Check an idea
            </Link>
          </span>
        </DeskEmpty>
      ) : (
        <Desk
          storageKey="ideas"
          showPaneOnNarrow={!!search.idea}
          onBack={() => navigate({ search: (s) => ({ ...s, idea: undefined }), replace: true })}
          backLabel="All ideas"
          list={
            shown.length ? (
              <div role="list" aria-label="Ideas">
                {ideas.length > 0 && savedAll.length === 0 && view === 'recent' && !search.view && <p className="border-b border-edge px-4 py-3 text-[0.875rem] text-ink">Nothing has been saved yet, so these are the recent checks. A visitor saves one from its page.</p>}
                {shown.map((i) => (
                  <div role="listitem" key={i.id}>
                    <DeskItem
                      selected={i.id === current}
                      onSelect={() => select(i.id)}
                      title={<span className="line-clamp-2 whitespace-normal" dir="auto">{i.idea}</span>}
                      detail={[day(i.checkedAt), closeWords(i.close.length), i.saved ? 'saved' : null].filter(Boolean).join(' · ')}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <p className="px-4 py-3 text-[0.875rem] text-ink">{nothingOn ? 'Every check in this view has something close.' : view === 'saved' ? 'No idea check has been saved.' : 'No recent idea check that was not saved.'}</p>
            )
          }
          pane={selected ? <IdeaPane idea={selected} position={ids.includes(selected.id) ? `${ids.indexOf(selected.id) + 1} of ${ids.length}` : undefined} /> : <DeskEmpty>Pick an idea to see what it found.</DeskEmpty>}
        />
      )}
    </main>
  )
}

const BAND: Record<IdeaCheckMatch['band'], string> = { close: 'close', far: 'further away', nearest: 'nearest, but far' }

// The idea, what it was compared with, every match with its closeness, and the AI's sentences when they were written.
function IdeaPane({ idea, position }: { idea: IdeaCheckRow; position?: string }) {
  const nothing = idea.close.length === 0
  const shown = nothing ? idea.matches.filter((m) => m.band === 'nearest') : idea.matches
  const names = new Map(idea.matches.map((m) => [m.startupId, m.name]))
  return (
    <DeskPane
      title={<span dir="auto">{idea.idea}</span>}
      statement={[
        languageName(idea.language),
        day(idea.checkedAt),
        `compared with ${idea.compared.toLocaleString('en-GB')} startups${idea.download ? `, download ${idea.download}` : ''}`,
        idea.saved ? 'saved' : null,
      ]
        .filter(Boolean)
        .join(' · ')}
      position={position}
    >
      {nothing && <p className="text-[0.875rem] text-ink">Nothing in the registry is close to this idea: a gap, or an idea described in words the registry does not use.</p>}
      {shown.length > 0 && (
        <PaneSection title={nothing ? `Nearest, but far (${shown.length})` : `Matches (${shown.length})`}>
          <p className="mb-2 text-[0.8125rem] text-ink-2">Closeness runs from 0 to 1; about 0.6 is a good match and about 0.5 is unrelated.</p>
          <table className="w-full border-collapse">
            <thead>
              <tr>
                {['Startup', 'Closeness', 'Band'].map((h) => (
                  <th key={h} scope="col" className={deskTh}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((m) => (
                <tr key={m.startupId}>
                  <td className={deskTd}>
                    <StartupLink id={m.startupId} className="text-glaze underline">
                      <span dir="auto">{m.name}</span>
                    </StartupLink>
                  </td>
                  <td className={cn(deskTd, 'tabular-nums')}>{m.closeness.toFixed(2)}</td>
                  <td className={deskTd}>{BAND[m.band]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </PaneSection>
      )}
      <PaneSection title="Same and different" aside={idea.explainedBy ?? undefined}>
        {idea.explanations && idea.explanations.length ? (
          <div className="grid gap-4">
            {idea.explanations.map((e) => (
              <div key={e.startupId} className="grid gap-1 text-[0.875rem] text-ink">
                <StartupLink id={e.startupId} className="font-medium text-glaze underline">
                  <span dir="auto">{names.get(e.startupId) ?? e.startupId}</span>
                </StartupLink>
                <p dir="auto">{e.same}</p>
                <p dir="auto">{e.different}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[0.875rem] text-ink">Not written: no AI key was saved when this idea was checked.</p>
        )}
      </PaneSection>
      <p className="text-[0.875rem]">
        <Link to="/ideas/$id" params={{ id: idea.id }} className="text-glaze underline">
          Open the public check
        </Link>
      </p>
    </DeskPane>
  )
}
