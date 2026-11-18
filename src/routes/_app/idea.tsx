import { Link, createFileRoute } from '@tanstack/react-router'
import { Bookmark } from 'lucide-react'

import { AskForm } from '@/components/athar/ask-form'
import { longDate } from '@/components/athar/profile'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { listIdeas } from '#/server/api/ideas'

type Search = { draft?: string }

export const Route = createFileRoute('/_app/idea')({
  validateSearch: (s: Record<string, unknown>): Search => ({
    draft: typeof s.draft === 'string' ? s.draft : undefined,
  }),
  loader: async () => ({ saved: await listIdeas() }),
  component: IdeaPage,
})

const EXAMPLES = ['Home-cooked meals delivered to office workers in Tunis', 'تطبيق لحجز موعد مع الطبيب في المناطق الريفية', 'Location de matériel agricole entre fermiers voisins']

// The idea page: ask with the same composer as the home page, then the checks you saved, newest first.
function IdeaPage() {
  const { saved } = Route.useLoaderData()
  const search = Route.useSearch()
  return (
    <main className="mx-auto w-full max-w-[72rem] flex-1 px-4 py-10 sm:px-8 lg:py-14">
      <h1 className="text-[2.25rem] leading-tight">Was it tried before?</h1>
      <p className="mt-3 max-w-[68ch] text-lg leading-8 text-ink">
        Describe an idea in Arabic, French or English. Athar places it among every startup in the Startup Tunisia registry by meaning and shows the closest ones, each with the registry entry it rests on.
      </p>
      <div className="mt-8">
        <AskForm initial={search.draft} examples={EXAMPLES} />
      </div>
      <SavedChecks saved={saved} />
    </main>
  )
}

function SavedChecks({ saved }: { saved: Awaited<ReturnType<typeof listIdeas>> }) {
  return (
    <section aria-labelledby="saved-checks" className="mt-14">
      <h2 id="saved-checks" className="flex items-baseline justify-between gap-4 border-b border-edge pb-2 font-sans text-[0.9375rem] font-medium text-ink">
        Saved idea checks
        {saved.length > 0 && <span className="text-[0.8125rem] font-normal text-ink-2 tabular-nums">{saved.length}</span>}
      </h2>
      {saved.length === 0 ? (
        <Empty className="py-10">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Bookmark aria-hidden />
            </EmptyMedia>
            <EmptyTitle>No saved checks yet</EmptyTitle>
            <EmptyDescription className="text-ink">Check an idea, then save it from its page. It stays here with its date, so you can come back when the registry grows.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <ul className="m-0 list-none p-0">
          {saved.map((c) => (
            <li key={c.id} className="grid gap-x-6 gap-y-1 border-b border-hairline py-3.5 sm:grid-cols-[minmax(0,1fr)_auto]">
              <Link to="/ideas/$id" params={{ id: c.id }} dir="auto" className="font-display text-[1.125rem] font-medium text-ink no-underline hover:text-glaze hover:underline">
                {c.idea}
              </Link>
              <span className="text-sm text-ink-2 tabular-nums">
                {longDate(c.checkedAt)} · {c.close === 0 ? 'nothing close' : `${c.close} close ${c.close === 1 ? 'startup' : 'startups'}`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
