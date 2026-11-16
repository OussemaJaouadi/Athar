import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { useMemo } from 'react'

import { TileWall } from '@/components/athar/tile-wall'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { getWall, searchStartups } from '#/server/api/app'

type Search = { q?: string; sector?: string }

export const Route = createFileRoute('/_app/search')({
  validateSearch: (s: Record<string, unknown>): Search => ({
    q: typeof s.q === 'string' && s.q ? s.q : undefined,
    sector: typeof s.sector === 'string' && s.sector ? s.sector : undefined,
  }),
  loaderDeps: ({ search }) => search,
  loader: async ({ deps }) => ({ results: await searchStartups({ data: deps }), wall: await getWall() }),
  component: ArchivePage,
})

// The archive: the whole wall at a glance, then catalogue records for what you looked up.
function ArchivePage() {
  const { results, wall } = Route.useLoaderData()
  const { rows, sectors, total } = results
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const filtering = Boolean(search.q || search.sector)
  const marked = useMemo(() => (filtering ? new Set(rows.map((r) => r.id)) : undefined), [filtering, rows])
  const missing = wall.filter((t) => !t.described).length

  if (total === 0) {
    return (
      <main className="mx-auto max-w-6xl px-6 py-16">
        <h1 className="text-3xl font-semibold">The archive is empty</h1>
        <p className="mt-3 max-w-prose text-ink-2">No registry has been collected yet. An operator runs Collect from the conservation lab to bring in the Startup Tunisia registry.</p>
      </main>
    )
  }

  return (
    <main className="mx-auto grid max-w-6xl gap-10 px-6 py-10">
      <section className="grid gap-2">
        <p className="font-mono text-xs text-ink-2">Startup Tunisia registry · {total} startups</p>
        <h1 className="max-w-3xl text-4xl leading-tight font-semibold text-balance">Every labelled Tunisian startup, with the record it came from.</h1>
        <p className="max-w-prose text-ink-2">
          Each tile is a startup; darker tiles were labelled earlier. The {missing} empty tiles are startups the registry lists without a description.
        </p>
      </section>

      <TileWall tiles={wall} marked={marked} />

      <section className="grid gap-6">
        <form
          className="flex flex-wrap items-center gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            const f = new FormData(e.currentTarget)
            navigate({ search: { q: String(f.get('q') ?? '') || undefined, sector: String(f.get('sector') ?? '') || undefined } })
          }}
        >
          <Input name="q" defaultValue={search.q} placeholder="What did they make? A name, a word, a sector" aria-label="Search the archive" className="h-10 min-w-0 flex-1 basis-72" />
          <select name="sector" defaultValue={search.sector ?? ''} aria-label="Sector" className="h-10 rounded-md border border-input bg-background px-3 text-sm">
            <option value="">All sectors</option>
            {sectors.map((s) => (
              <option key={s.sector} value={s.sector}>
                {s.sector} ({s.count})
              </option>
            ))}
          </select>
          <Button type="submit" className="h-10 px-5">
            Search the archive
          </Button>
        </form>

        {filtering && (
          <p className="text-sm text-ink-2">
            {rows.length === 0 ? 'No record matches. The archive only holds what the registry published.' : `${rows.length} records, marked in ochre on the wall.`}
          </p>
        )}

        <ol className="grid divide-y divide-hairline border-y border-hairline">
          {rows.map((s) => (
            <li key={s.id} className="grid gap-1 py-4 sm:grid-cols-[12rem_1fr] sm:gap-6">
              <div className="font-mono text-xs leading-5 text-ink-2">
                <div>{s.sector}</div>
                <div>{[s.cohort && `Labelled ${s.cohort}`, s.creation_year && `Founded ${s.creation_year}`].filter(Boolean).join(' · ')}</div>
              </div>
              <div className="min-w-0">
                <Link to="/startups/$id" params={{ id: s.id }} className="font-display text-lg font-semibold text-ink no-underline hover:underline">
                  {s.name}
                </Link>
                {s.description ? <p className="mt-1 line-clamp-2 text-ink-2">{s.description}</p> : <p className="mt-1 text-sm text-ink-2 italic">The registry gives no description.</p>}
              </div>
            </li>
          ))}
        </ol>
      </section>
    </main>
  )
}
