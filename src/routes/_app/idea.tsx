import { Link, createFileRoute, useNavigate, useRouter } from '@tanstack/react-router'
import { Trash2 } from 'lucide-react'
import { useState } from 'react'

import { Panel, SampleTag, Score, catalogueNo, labelledYear, shortDate } from '@/components/athar/kit'
import { Mark, MarkerText } from '@/components/kokonutui/marker-text'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { getIdeaCheck, listIdeaChecks, removeIdeaCheck, runIdeaCheck, type IdeaCheck, type IdeaMatch } from '#/server/api/sample'

type Search = { check?: string; draft?: string }

export const Route = createFileRoute('/_app/idea')({
  validateSearch: (s: Record<string, unknown>): Search => ({
    check: typeof s.check === 'string' ? s.check : undefined,
    draft: typeof s.draft === 'string' ? s.draft : undefined,
  }),
  loaderDeps: ({ search }) => ({ check: search.check }),
  loader: async ({ deps }) => {
    const list = await listIdeaChecks()
    const id = deps.check ?? list.checks[0]?.id
    return { list, report: id ? await getIdeaCheck({ data: id }) : null }
  },
  component: IdeaPage,
})

const EXAMPLES = ['Delivery of home-cooked meals to office workers', 'تطبيق لحجز الطبيب في المناطق الريفية', 'Plateforme de location de matériel agricole entre fermiers']

// Idea check: describe an idea; the archivist returns a dated report of precedents, each with its chain.
function IdeaPage() {
  const { list, report } = Route.useLoaderData()
  const { draft } = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const router = useRouter()
  const [text, setText] = useState(draft ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()

  const submit = async () => {
    setBusy(true)
    setError(undefined)
    try {
      const { id } = await runIdeaCheck({ data: text })
      setText('')
      await navigate({ search: { check: id } })
      router.invalidate()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="grid grid-cols-[minmax(0,1fr)] gap-5 px-4 py-5 sm:px-6 lg:px-8">
      <div className="grid gap-1">
        <p className="flex items-center gap-2 font-mono text-[0.6875rem] tracking-wide text-ink-2 uppercase">
          Idea check <SampleTag title="Matching uses keywords until Embed is built; scores are sample values" />
        </p>
        <h1 className="text-2xl font-semibold">Was it tried before?</h1>
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[20rem_minmax(0,1fr)]">
        <div className="grid gap-5 lg:sticky lg:top-16">
          <Panel title="Describe the idea">
            <form
              className="grid gap-3"
              onSubmit={(e) => {
                e.preventDefault()
                submit()
              }}
            >
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={5}
                aria-label="Your idea"
                dir="auto"
                className="w-full resize-y rounded-sm border border-control bg-canvas p-3 text-sm"
                placeholder="A marketplace where olive farmers sell directly to restaurants"
              />
              <div className="flex flex-wrap gap-1">
                {EXAMPLES.map((ex) => (
                  <button key={ex} type="button" dir="auto" onClick={() => setText(ex)} className="rounded-sm bg-surface px-1.5 py-0.5 text-start text-[0.6875rem] text-ink-2 hover:text-ink">
                    {ex}
                  </button>
                ))}
              </div>
              <Button type="submit" disabled={busy || text.trim().length < 8} className="h-9">
                {busy ? 'Reading the archive…' : 'Check against the archive'}
              </Button>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <p className="text-xs text-ink-2">Arabic, French or English. Each check is saved with its date, so you can come back when the archive grows.</p>
            </form>
          </Panel>

          <Panel title="Saved checks" meta={list.checks.length} bodyClassName="p-0">
            <ul className="divide-y divide-hairline">
              {list.checks.map((c) => (
                <li key={c.id} className={cn('group flex items-start gap-2 border-s-2 px-3 py-2.5', c.id === report?.id ? 'border-ochre bg-surface' : 'border-transparent')}>
                  <Link to="/idea" search={{ check: c.id }} className="grid min-w-0 flex-1 gap-0.5 no-underline">
                    <span dir="auto" className="line-clamp-2 text-sm text-ink">{c.idea}</span>
                    <span className="font-mono text-[0.625rem] text-ink-2">
                      {shortDate(c.checkedAt)} · {c.total === 0 ? 'no match' : `${c.close} close, ${c.total - c.close} partial`}
                    </span>
                  </Link>
                  <button
                    type="button"
                    aria-label="Delete this check"
                    onClick={async () => {
                      await removeIdeaCheck({ data: c.id })
                      await navigate({ search: {} })
                      router.invalidate()
                    }}
                    className="text-ink-2 opacity-0 group-hover:opacity-100 hover:text-destructive focus-visible:opacity-100"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          </Panel>
        </div>

        {report ? <Report report={report} /> : <p className="text-ink-2">Describe an idea to start.</p>}
      </div>
    </main>
  )
}

function Report({ report }: { report: IdeaCheck }) {
  const close = report.matches.filter((m) => m.band === 'close')
  const partial = report.matches.filter((m) => m.band === 'partial')
  const sectors = [...new Set(report.matches.map((m) => m.sector).filter(Boolean))]

  return (
    <article className="grid border border-hairline bg-canvas">
      <header className="grid gap-3 border-b border-hairline p-5">
        <p className="font-mono text-[0.6875rem] text-ink-2">
          REPORT · {shortDate(report.checkedAt)} · read against {report.against} records
        </p>
        <blockquote dir="auto" className="border-s-2 border-ochre ps-4 font-display text-xl leading-snug">
          {report.idea}
        </blockquote>
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-ink-2">
          looked for
          {report.terms.map((t) => (
            <span key={t} className="rounded-sm bg-surface px-1.5 py-0.5 font-mono text-[0.6875rem] text-ink">{t}</span>
          ))}
        </div>
      </header>

      <div className="grid gap-px border-b border-hairline bg-hairline sm:grid-cols-3">
        <Verdict label="Close precedents" value={close.length} note={close.length ? 'someone tried nearly this' : 'none close'} />
        <Verdict label="Partial overlaps" value={partial.length} note="share part of the idea" />
        <Verdict label="Sectors touched" value={sectors.length} note={sectors.slice(0, 2).join(', ') || '—'} />
      </div>

      {report.matches.length === 0 ? (
        <MarkerText as="div" className="grid gap-2 p-8 text-center">
          <p className="font-display text-xl">
            <Mark type="circle" color="var(--ochre)">No one tried this</Mark>, as far as these records go.
          </p>
          <p className="mx-auto max-w-lg text-sm text-ink-2">
            That can mean white space, or a startup that was never labelled. The registry only holds labelled startups; check the gaps on Themes before you trust the silence.
          </p>
          <div>
            <Link to="/themes" className="text-sm">See the gaps →</Link>
          </div>
        </MarkerText>
      ) : (
        <div className="grid">
          <MatchGroup title="Close precedents" matches={close} terms={report.terms} />
          <MatchGroup title="Partial overlaps" matches={partial} terms={report.terms} />
        </div>
      )}

      <footer className="border-t border-hairline px-5 py-3 text-xs text-ink-2">
        The archivist compares what each startup told the registry with your sentence. Every match links to the registry row it rests on.
      </footer>
    </article>
  )
}

function Verdict({ label, value, note }: { label: string; value: number; note: string }) {
  return (
    <div className="bg-canvas px-5 py-3">
      <div className="font-mono text-[0.625rem] tracking-wide text-ink-2 uppercase">{label}</div>
      <div className="font-display text-2xl font-semibold tabular-nums">{value}</div>
      <div className="truncate text-xs text-ink-2">{note}</div>
    </div>
  )
}

function highlight(text: string, terms: string[]) {
  if (!terms.length) return text
  const re = new RegExp(`(${terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi')
  return text.split(re).map((part, i) => (i % 2 ? <mark key={i} className="bg-transparent text-ochre-text underline decoration-ochre underline-offset-2">{part}</mark> : part))
}

function MatchGroup({ title, matches, terms }: { title: string; matches: IdeaMatch[]; terms: string[] }) {
  if (!matches.length) return null
  return (
    <section className="border-b border-hairline last:border-0">
      <h2 className="px-5 pt-4 pb-1 font-mono text-[0.6875rem] tracking-wide text-ink-2 uppercase">{title}</h2>
      <ol>
        {matches.map((m) => (
          <li key={m.id} className="grid gap-x-5 gap-y-1 px-5 py-3 md:grid-cols-[minmax(0,1fr)_auto]">
            <div className="min-w-0">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <Link to="/startups/$id" params={{ id: m.id }} className="font-medium">
                  {m.name}
                </Link>
                <span className="font-mono text-[0.6875rem] text-ink-2">
                  {catalogueNo(m.id)} · {m.sector} · labelled {labelledYear(m.cohort)}
                </span>
              </div>
              <p className="text-sm text-ink-2">{m.description ? highlight(m.description, m.shared) : 'No description in the registry; matched on its name.'}</p>
              <p className="mt-1 font-mono text-[0.6875rem] text-ink-2">
                shares {m.shared.length} of {terms.length}: {m.shared.join(', ')}
              </p>
            </div>
            <Score value={m.score} className="md:self-start md:pt-1" />
          </li>
        ))}
      </ol>
    </section>
  )
}
