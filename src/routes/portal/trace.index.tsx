import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { labControl, labPrimary } from '@/components/athar/lab'
import { findRows } from '#/server/api/portal'

type Search = { q?: string }
export const Route = createFileRoute('/portal/trace/')({
  validateSearch: (s: Record<string, unknown>): Search => ({
    q: typeof s.q === 'string' ? s.q : undefined,
  }),
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => findRows({ data: deps.q ?? '' }),
  component: TracePicker,
})
function TracePicker() {
  const rows = Route.useLoaderData()
  const { q } = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  return (
    <main className="grid gap-6 p-4 lg:p-6">
      <header>
        <h1 className="font-display text-[1.75rem] leading-9 font-medium">
          Trace a source row
        </h1>
        <p className="mt-1 text-ink-2">
          Follow a source row from the registry to its startup.
        </p>
      </header>
      <form
        className="flex max-w-xl flex-wrap gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          navigate({
            search: {
              q:
                String(new FormData(event.currentTarget).get('q') ?? '') ||
                undefined,
            },
          })
        }}
      >
        <input
          name="q"
          defaultValue={q}
          aria-label="Source row number or startup name"
          placeholder="Enter a row number or startup name"
          className={`${labControl} min-w-0 flex-1`}
        />
        <button className={labPrimary}>Find source rows</button>
      </form>
      <ul className="divide-y divide-hairline border-y border-hairline">
        {rows.map((row) => (
          <li
            key={row.id}
            className="flex flex-wrap items-center gap-x-6 gap-y-2 py-3"
          >
            <Link
              to="/portal/trace/$rowId"
              params={{ rowId: row.id }}
              className="text-glaze underline"
            >
              Row {row.row_number} · {row.name}
            </Link>
            <span className="text-ink-2">{row.sector}</span>
            <span className="text-ink-2">{row.changes} fields changed</span>
            <span className="ms-auto text-ink-2">
              {row.startup_id ? 'Matched to a startup' : 'Not matched yet'}
            </span>
          </li>
        ))}
      </ul>
      {!rows.length && (
        <p className="text-ink-2">
          {q
            ? 'No source rows match. Try another row number or name.'
            : 'No source rows yet. Collect the registry to trace a row.'}
        </p>
      )}
    </main>
  )
}
