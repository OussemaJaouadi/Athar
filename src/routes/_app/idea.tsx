import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'

import { longDate } from '@/components/athar/profile'
import { cn } from '@/lib/utils'
import { checkIdea, listIdeas, warmIdeaModel } from '#/server/api/ideas'

type Search = { draft?: string }

export const Route = createFileRoute('/_app/idea')({
  validateSearch: (s: Record<string, unknown>): Search => ({
    draft: typeof s.draft === 'string' ? s.draft : undefined,
  }),
  loader: async () => ({ saved: await listIdeas() }),
  component: IdeaPage,
})

const EXAMPLES = ['Home-cooked meals delivered to office workers in Tunis', 'تطبيق لحجز موعد مع الطبيب في المناطق الريفية', 'Location de matériel agricole entre fermiers voisins']

const fieldBtn = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-[4px] border px-4 text-sm font-medium transition-colors duration-150 motion-reduce:transition-none sm:min-h-10'
const fieldPrimary = cn(fieldBtn, 'border-[#6fcdb4] bg-[#6fcdb4] text-[#171412] hover:border-[#86d8c3] hover:bg-[#86d8c3]')

// Write an idea; the check opens on its own page (/ideas/<id>). Saved checks are listed beside the form.
function IdeaPage() {
  const { saved } = Route.useLoaderData()
  const search = Route.useSearch()
  return (
    <div className="grid flex-1 lg:grid-cols-[25rem_minmax(0,1fr)]">
      <section aria-label="The idea" className="flex flex-col bg-field px-6 py-8 text-field-ink sm:px-10 lg:sticky lg:top-14 lg:h-[calc(100dvh-3.5rem)] lg:overflow-y-auto">
        <Compose initial={search.draft} />
      </section>
      <main className="min-w-0">
        <SavedChecks saved={saved} />
      </main>
    </div>
  )
}

function Compose({ initial }: { initial?: string }) {
  const navigate = useNavigate({ from: '/idea' })
  const [text, setText] = useState(initial ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  // The embedding model takes up to a minute to load the first time; start while the idea is being typed.
  useEffect(() => void warmIdeaModel(), [])
  return (
    <form
      className="flex flex-1 flex-col"
      onSubmit={async (e) => {
        e.preventDefault()
        setBusy(true)
        setError(undefined)
        try {
          const { id } = await checkIdea({ data: text })
          navigate({ to: '/ideas/$id', params: { id } })
        } catch (err) {
          setError(err instanceof Error ? err.message : String(err))
          setBusy(false)
        }
      }}
    >
      <label htmlFor="idea" className="text-sm text-field-ink-2">
        Your idea
      </label>
      <textarea
        id="idea"
        dir="auto"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={7}
        placeholder="For example: a marketplace where olive farmers around Sfax sell directly to small foreign buyers."
        className="mt-3 w-full resize-y rounded-[4px] border border-field-rule bg-field-well px-4 py-3.5 font-display text-[1.375rem] leading-[1.875rem] text-field-ink caret-[#6fcdb4] placeholder:font-sans placeholder:text-base placeholder:leading-6 placeholder:text-field-ink-2"
      />
      <p className="mt-2 text-sm leading-5 text-field-ink-2">Arabic, French or English. Say who it serves and what it does.</p>
      {error && <p className="mt-3 text-sm text-[#f08a80]">{error}</p>}
      <div className="mt-5 flex flex-wrap gap-2">
        <button type="submit" disabled={busy} className={cn(fieldPrimary, busy && 'cursor-progress')}>
          {busy ? 'Checking…' : 'Check the idea'}
        </button>
      </div>
      <div className="mt-auto pt-10">
        <p className="text-[0.8125rem] text-field-ink-2">Or start from one of these</p>
        <ul className="mt-2 grid gap-1.5">
          {EXAMPLES.map((ex) => (
            <li key={ex}>
              <button type="button" dir="auto" onClick={() => setText(ex)} className="text-start text-sm text-field-ink underline decoration-field-rule underline-offset-[3px] hover:decoration-field-ink">
                {ex}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </form>
  )
}

function SavedChecks({ saved }: { saved: Awaited<ReturnType<typeof listIdeas>> }) {
  return (
    <div className="max-w-[60rem] px-4 py-10 sm:px-10 lg:px-16 lg:py-14">
      <h2 className="text-[1.75rem] leading-9">Was it tried before?</h2>
      <p className="mt-3 max-w-[62ch] text-ink">
        Athar places your idea among every startup in the Startup Tunisia registry by meaning, in Arabic, French or English, and shows the closest ones with the registry entry each rests on. Save a check to come back to it when the registry grows.
      </p>
      <h3 className="mt-12 border-b border-control pb-2 font-sans text-sm font-medium text-ink-2">Saved idea checks</h3>
      {saved.length === 0 ? (
        <p className="py-4 text-sm text-ink-2">None saved yet. A check you save stays here with its date.</p>
      ) : (
        <ul className="m-0 list-none p-0">
          {saved.map((c) => (
            <li key={c.id} className="grid gap-x-6 gap-y-1 border-b border-hairline py-3.5 sm:grid-cols-[minmax(0,1fr)_auto]">
              <Link to="/ideas/$id" params={{ id: c.id }} dir="auto" className="font-display font-medium text-ink no-underline hover:text-glaze hover:underline">
                {c.idea}
              </Link>
              <span className="text-sm text-ink-2">
                {longDate(c.checkedAt)} · {c.close === 0 ? 'nothing close' : `${c.close} close ${c.close === 1 ? 'startup' : 'startups'}`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
