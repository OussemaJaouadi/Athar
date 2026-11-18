import { Link } from '@tanstack/react-router'

import { longDate } from '@/components/athar/profile'
import type { listIdeas } from '#/server/api/ideas'

/** The idea checks saved from their page, newest first, under the form that makes them. */
export function SavedChecks({ saved }: { saved: Awaited<ReturnType<typeof listIdeas>> }) {
  return (
    <section aria-labelledby="saved-checks" className="mt-12">
      <h2 id="saved-checks" className="flex items-baseline justify-between gap-4 border-b border-edge pb-2 font-sans text-[0.9375rem] font-medium text-ink">
        Saved idea checks
        <span className="text-[0.8125rem] font-normal text-ink-2 tabular-nums">{saved.length}</span>
      </h2>
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
    </section>
  )
}
