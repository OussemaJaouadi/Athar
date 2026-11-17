import { Link, createFileRoute, useNavigate, useRouter } from '@tanstack/react-router'
import { Bookmark, BookmarkCheck, Pencil, Plus } from 'lucide-react'
import { useEffect, useState } from 'react'

import { longDate, yearOf } from '@/components/athar/profile'
import { cn } from '@/lib/utils'
import { getIdeaCheck, listIdeaChecks, saveIdeaCheck, type IdeaCheck, type IdeaMatch } from '#/server/api/idea'
import { checkIdea, warmIdeaModel } from '#/server/api/ideas'

type Search = { check?: string; draft?: string; edit?: boolean }

export const Route = createFileRoute('/_app/idea')({
  validateSearch: (s: Record<string, unknown>): Search => ({
    check: typeof s.check === 'string' ? s.check : undefined,
    draft: typeof s.draft === 'string' ? s.draft : undefined,
    edit: s.edit === true || s.edit === 'true' ? true : undefined,
  }),
  loaderDeps: ({ search }) => ({ check: search.check }),
  loader: async ({ deps }) => ({ saved: await listIdeaChecks(), report: deps.check ? await getIdeaCheck({ data: deps.check }) : null }),
  component: IdeaPage,
})

const EXAMPLES = ['Home-cooked meals delivered to office workers in Tunis', 'تطبيق لحجز موعد مع الطبيب في المناطق الريفية', 'Location de matériel agricole entre fermiers voisins']

const fieldBtn = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-[4px] border px-4 text-sm font-medium transition-colors duration-150 motion-reduce:transition-none sm:min-h-10'
const fieldPrimary = cn(fieldBtn, 'border-[#6fcdb4] bg-[#6fcdb4] text-[#171412] hover:border-[#86d8c3] hover:bg-[#86d8c3]')
const fieldQuiet = cn(fieldBtn, 'border-field-rule bg-transparent text-field-ink hover:border-field-ink-2 hover:bg-white/5')

// Idea check, report option A: the idea owns a manganese field; the answer is a dated report.
function IdeaPage() {
  const { saved, report } = Route.useLoaderData()
  const search = Route.useSearch()
  const composing = !report || search.edit
  return (
    <div className="grid flex-1 lg:grid-cols-[25rem_minmax(0,1fr)]">
      <section aria-label="The idea" className="flex flex-col bg-field px-6 py-8 text-field-ink sm:px-10 lg:sticky lg:top-14 lg:h-[calc(100dvh-3.5rem)] lg:overflow-y-auto">
        {composing ? <Compose initial={search.edit ? report?.idea : search.draft} /> : <IdeaField report={report} />}
      </section>
      <main className="min-w-0">{composing ? <SavedChecks saved={saved} /> : <Report report={report} />}</main>
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

function IdeaField({ report }: { report: IdeaCheck }) {
  const router = useRouter()
  const [saved, setSaved] = useState(report.saved)
  return (
    <>
      <p className="text-sm text-field-ink-2">Checked {longDate(report.checkedAt)}</p>
      <h1 dir="auto" className="mt-2 font-display text-[2.125rem] leading-[2.625rem] font-medium tracking-[-0.01em] text-pretty">
        {report.idea}
      </h1>
      {report.words.length > 0 && (
        <div className="mt-6 flex flex-wrap items-center gap-2 text-sm text-field-ink-2">
          Read as the words
          {report.words.map((w) => (
            <span key={w} className="rounded-[4px] border border-field-rule px-2.5 py-0.5 text-field-ink">
              {w}
            </span>
          ))}
        </div>
      )}
      <div className="mt-auto pt-10">
        <p className="max-w-[36ch] text-sm leading-5 text-field-ink-2">
          Compared with the name, description and sector of {report.against} startups{report.snapshotAt && `, registry snapshot of ${longDate(report.snapshotAt)}`}.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            className={saved ? fieldQuiet : fieldPrimary}
            onClick={async () => {
              await saveIdeaCheck({ data: { id: report.id, saved: !saved } })
              setSaved(!saved)
              router.invalidate()
            }}
          >
            {saved ? <BookmarkCheck className="size-4" /> : <Bookmark className="size-4" />}
            {saved ? 'Saved' : 'Save idea check'}
          </button>
          <Link to="/idea" search={{ check: report.id, edit: true }} className={cn(fieldQuiet, 'no-underline')}>
            <Pencil className="size-4" /> Edit idea
          </Link>
          <Link to="/idea" className={cn(fieldQuiet, 'no-underline')}>
            <Plus className="size-4" /> New idea
          </Link>
        </div>
      </div>
    </>
  )
}

function SavedChecks({ saved }: { saved: Awaited<ReturnType<typeof listIdeaChecks>> }) {
  return (
    <div className="max-w-[60rem] px-4 py-10 sm:px-10 lg:px-16 lg:py-14">
      <h2 className="text-[1.75rem] leading-9">Was it tried before?</h2>
      <p className="mt-3 max-w-[62ch] text-ink">
        Athar compares your idea with every startup in the Startup Tunisia registry and shows the closest ones with the registry row each rests on. Save a check to come back to it when the registry grows.
      </p>
      <h3 className="mt-12 border-b border-control pb-2 font-sans text-sm font-medium text-ink-2">Saved idea checks</h3>
      {saved.length === 0 ? (
        <p className="py-4 text-sm text-ink-2">None saved yet. A check you save stays here with its date.</p>
      ) : (
        <ul className="m-0 list-none p-0">
          {saved.map((c) => (
            <li key={c.id} className="grid gap-x-6 gap-y-1 border-b border-hairline py-3.5 sm:grid-cols-[minmax(0,1fr)_auto]">
              <Link to="/idea" search={{ check: c.id }} dir="auto" className="font-display font-medium text-ink no-underline hover:text-glaze hover:underline">
                {c.idea}
              </Link>
              <span className="text-sm text-ink-2">
                {longDate(c.checkedAt)} · {c.matches === 0 ? 'no precedent found' : `${c.matches} startups share several words`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function marked(text: string, words: string[]) {
  if (!words.length) return text
  const re = new RegExp(`(${words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi')
  return text.split(re).map((part, i) =>
    i % 2 ? (
      <mark key={i} className="bg-transparent text-inherit underline decoration-ochre decoration-2 underline-offset-4">
        {part}
      </mark>
    ) : (
      part
    ),
  )
}

function facts(m: IdeaMatch) {
  return [m.sector, m.creation_year && `created ${m.creation_year}`, yearOf(m.labelled) && `labelled ${yearOf(m.labelled)}`].filter(Boolean).join(' · ')
}

function Report({ report }: { report: IdeaCheck }) {
  const [lead, ...rest] = report.matches
  const n = report.strong
  const tied = lead ? report.matches.filter((m) => Math.abs(m.score - lead.score) < 0.01) : []
  const names = (ms: IdeaMatch[]) => (ms.length === 2 ? `${ms[0].name} and ${ms[1].name}` : `${ms.slice(0, -1).map((m) => m.name).join(', ')} and ${ms[ms.length - 1].name}`)
  const quoted = (ws: string[]) => ws.map((w) => `“${w}”`).join(', ')
  return (
    <div className="max-w-[72.5rem] px-4 py-10 sm:px-10 lg:px-16 lg:py-14">
      {!lead ? (
        <>
          <h2 className="max-w-[19em] text-[2.25rem] leading-[2.75rem] tracking-[-0.015em] sm:text-[2.75rem] sm:leading-[3.25rem]">No startup in the registry describes this.</h2>
          <p className="mt-4 max-w-[62ch] text-ink">
            Athar compared it with all {report.against} startups. {report.any === 0 ? `None uses ${quoted(report.words) || 'these words'}.` : `${report.weakTotal === 1 ? 'One shares' : `${report.weakTotal} share`} a single word with it, which is not enough to call it a precedent.${report.weakTotal > report.weak.length ? ` The ${report.weak.length} with the rarest words are below.` : ''}`}
          </p>
          {report.weak.length > 0 && (
            <section className="mt-8 max-w-[56rem]" aria-labelledby="weak-h">
              <h3 id="weak-h" className="border-b border-control pb-2 font-sans text-sm font-medium text-ink-2">
                Shares a single word
              </h3>
              <ul className="m-0 list-none p-0">
                {report.weak.map((m) => (
                  <li key={m.id} className="grid gap-x-6 gap-y-1 border-b border-hairline py-3 md:grid-cols-[12.5rem_minmax(0,1fr)_auto] md:items-baseline">
                    <b className="font-display font-medium">{m.name}</b>
                    <span className="text-sm text-ink-2">only “{m.shared[0]}” · {m.sector}</span>
                    <Link to="/startups/$id" params={{ id: m.id }} className="text-sm whitespace-nowrap">
                      Read in full
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <div className="mt-8 max-w-[64ch] bg-surface px-5 py-4 text-[0.9375rem] leading-6">
            <strong className="font-medium">What a no-match means.</strong> No labelled startup in the Startup Tunisia registry describes this in these words. Startups outside the registry are not here, and a match by meaning may still exist once the archive is indexed, so ask around before you count on being first.
          </div>
          <p className="mt-8 text-sm">
            <Link to="/landscape">See the registry by sector and year</Link>
          </p>
        </>
      ) : (
        <>
          <h2 className="max-w-[19em] text-[2.25rem] leading-[2.75rem] tracking-[-0.015em] sm:text-[2.75rem] sm:leading-[3.25rem]">
            {n === 1 ? (
              <>
                One startup shares two or more words with this idea: <em className="font-bold text-ink not-italic">{lead.name}.</em>
              </>
            ) : (
              <>
                {n} startups share two or more words with this idea.{' '}
                <em className="font-bold text-ink not-italic">
                  {tied.length === 1 ? `${lead.name} shares the most.` : tied.length <= 3 ? `${names(tied)} share the most, equally.` : `${tied.length} of them share the most, equally.`}
                </em>
              </>
            )}
          </h2>
          <p className="mt-3 max-w-[70ch] text-[0.9375rem] text-ink">
            {n > report.matches.length ? `The ${report.matches.length} closest are below. ` : ''}Matched on shared words in each startup&apos;s registry entry; rare words count for more than common ones. Shared words are a lead, not proof of the same business: read each description.
          </p>

          <section className="mt-10 border-t-2 border-ink pt-7" aria-labelledby="lead-h">
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <h3 id="lead-h" className="text-[1.75rem] leading-9">
                {lead.name}
              </h3>
              <span className="text-sm text-ink-2">{facts(lead)}</span>
            </div>
            <p className="mt-1.5 text-sm text-ink-2">{lead.website ? 'Website not checked yet' : 'No website in the registry'}</p>
            {lead.description && (
              <figure className="mt-5 max-w-[72ch] bg-surface px-5 pt-4 pb-[1.125rem]">
                <figcaption className="flex items-center gap-2 text-[0.8125rem] leading-[1.125rem] text-ink-2">
                  <span aria-hidden className="size-2 bg-ochre" /> Description as registered
                </figcaption>
                <blockquote dir="auto" className="m-0 mt-2 leading-[1.625rem]">
                  {marked(lead.description, lead.shared)}
                </blockquote>
              </figure>
            )}
            <dl className="mt-6 grid max-w-[72ch] gap-x-12 gap-y-6 sm:grid-cols-2">
              <div>
                <dt className="text-[0.8125rem] font-medium text-ink-2">Shared with your idea</dt>
                <dd className="m-0 mt-1 text-[1.0625rem] leading-[1.625rem]">{lead.shared.join(', ')}</dd>
              </div>
              <div>
                <dt className="text-[0.8125rem] font-medium text-ink-2">In your idea, not in its entry</dt>
                <dd className="m-0 mt-1 text-[1.0625rem] leading-[1.625rem]">{lead.missing.length ? lead.missing.join(', ') : 'Nothing: every word appears'}</dd>
              </div>
            </dl>
            <p className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-sm">
              <Link to="/startups/$id" params={{ id: lead.id }}>
                Open profile
              </Link>
              <span className="text-[0.8125rem] text-ink-2">Underlined: words your idea shares</span>
            </p>
          </section>

          {rest.length > 0 && (
            <section className="mt-11" aria-labelledby="also-h">
              <h3 id="also-h" className="border-b border-control pb-2 font-sans text-sm font-medium text-ink-2">
                Also sharing words
              </h3>
              <ul className="m-0 list-none p-0">
                {rest.map((m) => (
                  <li key={m.id} className="grid gap-x-6 gap-y-1 border-b border-hairline py-3.5 md:grid-cols-[12.5rem_minmax(0,1fr)_14rem_auto] md:items-baseline">
                    <b className="font-display font-medium">{m.name}</b>
                    <span className="line-clamp-2 text-[0.9375rem]">{m.description ?? 'No description in the registry.'}</span>
                    <span className="text-sm text-ink-2">shares {m.shared.join(', ')}</span>
                    <Link to="/startups/$id" params={{ id: m.id }} className="text-sm whitespace-nowrap">
                      Read in full
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <p className="mt-10 max-w-[68ch] text-sm leading-[1.375rem] text-ink">
            <strong className="font-medium text-ink">How this was checked.</strong> Your idea was split into words, and rare words weigh more than common ones. A startup counts when its name, description or sector shares at least two of them, or 40% of them. Once the archive is indexed, matches come by meaning and each one says what is the same and what differs.
          </p>
        </>
      )}
    </div>
  )
}
