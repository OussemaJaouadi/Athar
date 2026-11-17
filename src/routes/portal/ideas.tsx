import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { useCallback } from 'react'

import { Desk, DeskBar, DeskEmpty, DeskItem, DeskPane, PaneSection, useDeskKeys } from '@/components/athar/desk'
import { StartupLink } from '@/components/athar/startup-glimpse'
import { cn } from '@/lib/utils'
import { getIdeaCheckRow, listIdeaChecks } from '#/server/api/ops'
import type { IdeaCheckRow } from '#/server/pipeline/facts'

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

// The row carries the close startups by name and the model that explained them; closeness numbers, the far and
// nearest matches and the sentences themselves are on the public check page, so they are linked, not invented here.
function IdeaPane({ idea, position }: { idea: IdeaCheckRow; position?: string }) {
  const nothing = idea.close.length === 0
  return (
    <DeskPane
      title={<span dir="auto">{idea.idea}</span>}
      statement={[languageName(idea.language), day(idea.checkedAt), idea.saved ? 'saved' : null].filter(Boolean).join(' · ')}
      position={position}
    >
      {nothing && <p className="text-[0.875rem] text-ink">Nothing in the registry is close to this idea: a gap, or an idea described in words the registry does not use.</p>}
      {!nothing && (
        <PaneSection title={`Close startups (${idea.close.length})`}>
          <ul className="grid">
            {idea.close.map((s) => (
              <li key={s.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 border-b border-hairline py-[7px] text-[0.875rem]">
                <StartupLink id={s.id} className="text-glaze underline">
                  {s.name}
                </StartupLink>
                <span className="text-ink-2">close</span>
              </li>
            ))}
          </ul>
        </PaneSection>
      )}
      <PaneSection title="Same and different">
        <p className="text-[0.875rem] text-ink">
          {idea.explainedBy ? (
            <>
              Written by <span className="text-ink-2">{idea.explainedBy}</span>; the sentences are on the public check.
            </>
          ) : (
            'Not written: no AI key was saved when this idea was checked.'
          )}
        </p>
      </PaneSection>
      <p className="text-[0.875rem]">
        <Link to="/ideas/$id" params={{ id: idea.id }} className="text-glaze underline">
          {nothing ? 'Open the public check: the nearest startups, and how far they are' : 'Open the public check: closeness, further matches and the sentences'}
        </Link>
      </p>
    </DeskPane>
  )
}
