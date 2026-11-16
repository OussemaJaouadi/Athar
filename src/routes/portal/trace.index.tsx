import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'

import { PageHeader } from '@/components/athar/kit'
import { findRows } from '#/server/api/portal'

type Search = { q?: string }

export const Route = createFileRoute('/portal/trace/')({
  validateSearch: (s: Record<string, unknown>): Search => ({ q: typeof s.q === 'string' ? s.q : undefined }),
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => findRows({ data: deps.q ?? '' }),
  component: TracePicker,
})

// Micro view entry: pick any registry row by number or name and follow it through every step.
function TracePicker() {
  const rows = Route.useLoaderData()
  const { q } = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  return (
    <main className="grid grid-cols-[minmax(0,1fr)] gap-4 p-4 lg:p-6">
      <PageHeader eyebrow="Trace" title="Follow one row from the registry to the catalogue" />
      <form
        className="flex max-w-xl border border-control bg-canvas"
        onSubmit={(e) => {
          e.preventDefault()
          navigate({ search: { q: String(new FormData(e.currentTarget).get('q') ?? '') || undefined } })
        }}
      >
        <input name="q" defaultValue={q} aria-label="Row number or name" placeholder="Row number (87) or a name (Artify)" className="min-w-0 flex-1 bg-transparent px-3 py-2 outline-none" />
        <button type="submit" className="border-s border-hairline px-4 text-ink-2 hover:text-ink">Find</button>
      </form>
      <div className="overflow-x-auto border border-hairline bg-canvas">
        <table className="w-full">
          <thead className="text-ink-2">
            <tr className="border-b border-hairline">
              {['Row', 'Name as cleaned', 'Sector', 'Edits', 'Catalogued'].map((h) => (
                <th key={h} className="px-3 py-2 text-start font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-hairline last:border-0 hover:bg-surface">
                <td className="px-3 py-1.5 font-mono text-xs tabular-nums">
                  <Link to="/portal/trace/$rowId" params={{ rowId: r.id }}>#{r.row_number}</Link>
                </td>
                <td className="px-3 py-1.5">
                  <Link to="/portal/trace/$rowId" params={{ rowId: r.id }} className="text-ink">{r.name}</Link>
                </td>
                <td className="px-3 py-1.5 text-ink-2">{r.sector}</td>
                <td className="px-3 py-1.5 font-mono text-xs">{r.changes || ''}</td>
                <td className="px-3 py-1.5 text-xs text-ink-2">{r.startup_id ? 'yes' : 'no'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="px-3 py-8 text-center text-ink-2">No row matches.</p>}
      </div>
    </main>
  )
}
