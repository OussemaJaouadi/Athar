import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { useCallback } from 'react'

import { Desk, DeskBar, DeskEmpty, DeskItem, DeskPane, PaneSection, deskTd, deskTh, useDeskKeys } from '@/components/athar/desk'
import { StartupLink } from '@/components/athar/startup-glimpse'
import { cn } from '@/lib/utils'
import { getIdeaCheckRow, listIdeaChecks } from '#/server/api/ops'
import type { IdeaCheckMatch, IdeaCheckRow } from '#/server/pipeline/facts'

type Filter = 'nothing' | 'saved'
type Search = { idea?: string; show?: Filter }

export const Route = createFileRoute('/portal/ideas')({
  validateSearch: (s: Record<string, unknown>): Search => ({
    idea: typeof s.idea === 'string' && s.idea ? s.idea : undefined,
    show: s.show === 'nothing' || s.show === 'saved' ? s.show : undefined,
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

  const nothing = ideas.filter((i) => i.close.length === 0).length
  const shown = search.show === 'nothing' ? ideas.filter((i) => i.close.length === 0) : search.show === 'saved' ? ideas.filter((i) => i.saved) : ideas
  const current = search.idea ?? shown[0]?.id
  const selected = shown.find((i) => i.id === current) ?? ideas.find((i) => i.id === current) ?? (linked && linked.id === current ? linked : undefined)
  const ids = shown.map((i) => i.id)

  const select = useCallback((id: string) => navigate({ search: (s) => ({ ...s, idea: id }), replace: true }), [navigate])
  useDeskKeys({ ids, current, select })

  const chip = (value: Filter | undefined, label: string, count: number) => {
    const on = search.show === value
    return (
      <button
        type="button"
        aria-pressed={on}
        onClick={() => navigate({ search: (s) => ({ ...s, show: value, idea: undefined }), replace: true })}
        className={cn(
          'inline-flex h-7 items-center gap-1.5 rounded-[5px] border border-edge px-2.5 text-[0.8125rem] whitespace-nowrap text-ink',
          on ? 'bg-surface-raised shadow-[inset_0_-2px_0_var(--ink)]' : 'hover:bg-surface',
        )}
      >
        {label} <span className="tabular-nums">{count}</span>
      </button>
    )
  }

  return (
    <main className="flex min-h-0 flex-1 flex-col">
      <DeskBar title="Ideas" facts={ideas.length ? `${ideas.length} ${ideas.length === 1 ? 'idea' : 'ideas'} checked · ${nothing} found nothing close` : 'No idea checked yet'}>
        {ideas.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {chip(undefined, 'All', ideas.length)}
            {chip('nothing', 'Nothing close', nothing)}
            {chip('saved', 'Saved', ideas.filter((i) => i.saved).length)}
          </div>
        )}
      </DeskBar>
      {ideas.length === 0 && !linked ? (
        <DeskEmpty>
          <span className="grid justify-items-center gap-2">
            <span>No idea has been checked yet. Ideas typed on the home page or /idea appear here.</span>
            <Link to="/idea" className="text-glaze underline">
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
              <p className="px-4 py-3 text-[0.875rem] text-ink">{search.show === 'saved' ? 'No idea check has been saved.' : 'Every idea checked so far has something close.'}</p>
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
