import { Link, createFileRoute, getRouteApi, useNavigate, useRouter } from '@tanstack/react-router'
import { ArrowRight, Bookmark, BookmarkCheck, CornerDownLeft } from 'lucide-react'
import { useState } from 'react'

import { cn } from '@/lib/utils'
import { getWallCards, type RegistryCard } from '#/server/api/app'
import { getIdeaCheck, runIdeaCheck, saveIdeaCheck, type IdeaMatch } from '#/server/api/idea'

type Search = { check?: string; draft?: string }
const shell = getRouteApi('/_app')

export const Route = createFileRoute('/_app/')({
  validateSearch: (s: Record<string, unknown>): Search => ({
    check: typeof s.check === 'string' ? s.check : undefined,
    draft: typeof s.draft === 'string' ? s.draft : undefined,
  }),
  loaderDeps: ({ search }) => ({ check: search.check }),
  loader: async ({ deps }) => {
    const report = deps.check ? await getIdeaCheck({ data: deps.check }) : null
    if (!report) return { report: null, cards: await getWallCards({ data: { perSector: 3 } }) }
    const ids = [...report.matches, ...report.weak].map((m) => m.id)
    return { report, cards: ids.length ? await getWallCards({ data: { ids } }) : [] }
  },
  component: Home,
})

const EXAMPLES = ['Olive farmers selling straight to restaurants abroad', 'تطبيق لحجز موعد مع الطبيب في الأرياف', 'Location de matériel agricole entre voisins']

const longDate = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })

// Home: ask the registry. The answer rises out of the wall of startups, each with the row it rests on.
function Home() {
  const { report, cards } = Route.useLoaderData()
  const { draft } = Route.useSearch()
  return report ? <Answer report={report} cards={cards} /> : <Ask cards={cards} draft={draft} />
}

function AskForm({ initial, compact }: { initial?: string; compact?: boolean }) {
  const navigate = useNavigate()
  const [text, setText] = useState(initial ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  return (
    <form
      role="search"
      onSubmit={async (e) => {
        e.preventDefault()
        setBusy(true)
        setError(undefined)
        try {
          const { id } = await runIdeaCheck({ data: text })
          await navigate({ to: '/', search: { check: id } })
        } catch (err) {
          setError(err instanceof Error ? err.message : String(err))
        } finally {
          setBusy(false)
        }
      }}
      className="grid gap-3"
    >
      <label className={cn('flex items-center gap-3 rounded-full border border-control bg-surface ps-6 pe-2 transition-colors focus-within:border-ink', compact ? 'h-14' : 'h-16 sm:h-[4.5rem]')}>
        <span className="sr-only">Describe your idea</span>
        <input
          dir="auto"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Describe your idea in a sentence"
          className={cn('min-w-0 flex-1 bg-transparent outline-none placeholder:text-ink-2', compact ? 'text-base' : 'text-lg sm:text-xl')}
        />
        <button
          type="submit"
          disabled={busy || text.trim().length < 12}
          className="inline-flex h-11 shrink-0 items-center gap-2 rounded-full bg-glaze px-5 text-sm font-medium text-glaze-ink transition-opacity hover:bg-glaze-hover disabled:cursor-not-allowed disabled:bg-surface-raised disabled:text-ink-2"
        >
          {busy ? 'Reading…' : 'Ask'} <CornerDownLeft className="size-4" aria-hidden />
        </button>
      </label>
      {error && <p className="ps-6 text-sm text-destructive">{error}</p>}
      {!compact && (
        <ul className="flex flex-wrap gap-x-5 gap-y-1 ps-6 text-sm text-ink-2">
          {EXAMPLES.map((ex) => (
            <li key={ex}>
              <button type="button" dir="auto" onClick={() => setText(ex)} className="underline decoration-hairline underline-offset-4 hover:text-ink hover:decoration-ink">
                {ex}
              </button>
            </li>
          ))}
        </ul>
      )}
    </form>
  )
}

function Ask({ cards, draft }: { cards: RegistryCard[]; draft?: string }) {
  const { corpus } = shell.useLoaderData()
  return (
    <main className="flex-1">
      <section className="mx-auto w-full max-w-[90rem] px-4 pt-14 pb-14 sm:px-8 lg:pt-24">
        <h1 className="text-[clamp(3.25rem,8vw,7rem)] leading-[0.92] tracking-[-0.015em]">
          Was it tried
          <span className="block sm:ps-[14%]">in Tunisia?</span>
        </h1>
        <div className="mt-12 grid gap-10 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start">
          <AskForm initial={draft} />
          <p className="text-lg leading-8 text-ink-2 lg:pt-3">
            Athar reads all {corpus.startups} startups in the Startup Tunisia registry and answers with the exact row each one comes from.
          </p>
        </div>
      </section>

      <section aria-label="The registry" className="mx-auto w-full max-w-[90rem] px-4 pb-20 sm:px-8">
        <div className="mb-5 flex items-baseline justify-between gap-4 border-t border-hairline pt-4 text-sm text-ink-2">
          <span>From the registry</span>
          <span>
            {corpus.startups} startups{corpus.fetchedAt && ` · snapshot of ${longDate(corpus.fetchedAt)}`}
          </span>
        </div>
        <div className="relative max-h-[52rem] overflow-hidden">
          <div className="columns-1 gap-3 sm:columns-2 lg:columns-4 2xl:columns-5">
            {cards.map((c) => (
              <Card key={c.id} card={c} />
            ))}
          </div>
          <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-56 bg-gradient-to-b from-transparent to-canvas" />
        </div>
        <div className="mt-2 flex justify-center">
          <Link to="/search" className="inline-flex items-center gap-2 rounded-full border border-control px-5 py-2.5 text-sm text-ink no-underline hover:bg-surface">
            Browse all {corpus.startups} <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>
      </section>
    </main>
  )
}

function marked(text: string, words: string[]) {
  if (!words.length) return text
  const escaped = words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  // Mark the whole word around a match: "sell" lights all of "sellers".
  const re = new RegExp(`(\\p{L}*(?:${escaped.join('|')})\\p{L}*)`, 'giu')
  return text.split(re).map((part, i) =>
    i % 2 ? (
      <mark key={i} className="rounded-[2px] bg-[color-mix(in_oklab,var(--ochre)_30%,transparent)] px-0.5 text-ink">
        {part}
      </mark>
    ) : (
      part
    ),
  )
}

const decode = (t: string) => t.replace(/&amp;/g, '&').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"')

function Card({ card, words = [], lit, size = 'sm' }: { card: RegistryCard; words?: string[]; lit?: boolean; size?: 'sm' | 'lg' }) {
  return (
    <Link
      to="/startups/$id"
      params={{ id: card.id }}
      className={cn(
        'mb-3 block break-inside-avoid rounded-md border p-4 no-underline transition-colors',
        lit ? 'border-ochre bg-canvas shadow-[0_0_0_1px_var(--ochre)]' : 'border-hairline bg-surface hover:border-control',
      )}
    >
      <span className="flex items-baseline justify-between gap-3 font-mono text-xs text-ink-2">
        <span className="truncate">{card.sector ?? 'No sector'}</span>
        {card.row !== null && <span className="shrink-0">row {card.row}</span>}
      </span>
      <span className={cn('mt-2 block font-display font-bold text-ink', size === 'lg' ? 'text-2xl' : 'text-lg')}>{card.name}</span>
      {card.description && (
        <span dir="auto" className={cn('mt-1.5 block font-light text-ink-2', size === 'lg' ? 'text-[0.9375rem] leading-6' : 'line-clamp-5 text-sm leading-[1.4rem]', lit && 'text-ink/85')}>
          {marked(decode(card.description), words)}
        </span>
      )}
    </Link>
  )
}

type Report = NonNullable<Awaited<ReturnType<typeof getIdeaCheck>>>

function Answer({ report, cards }: { report: Report; cards: RegistryCard[] }) {
  const router = useRouter()
  const [saved, setSaved] = useState(report.saved)
  const byId = new Map(cards.map((c) => [c.id, c]))
  const lead = report.matches.slice(0, 3)
  const more = report.matches.slice(3)
  const n = report.strong
  const verdict = n === 0 ? 'No close precedent.' : n >= 6 ? 'Many tried parts of this.' : 'Tried before.'
  const card = (m: IdeaMatch) => byId.get(m.id) ?? { id: m.id, name: m.name, sector: m.sector, row: null, cohort: m.cohort, description: m.description }

  return (
    <main className="mx-auto w-full max-w-[90rem] flex-1 px-4 pt-10 pb-24 sm:px-8 lg:pt-14">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <div>
          <p className="text-sm text-ink-2">Your idea, checked {longDate(report.checkedAt)} against {report.against} startups</p>
          <p dir="auto" className="mt-2 max-w-[40ch] font-display text-[1.75rem] leading-9 font-bold sm:text-[2.125rem] sm:leading-[2.75rem]">
            “{report.idea}”
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/" search={{ draft: report.idea }} className="inline-flex h-10 items-center rounded-full border border-control px-4 text-sm text-ink no-underline hover:bg-surface">
            Edit idea
          </Link>
          <button
            type="button"
            onClick={async () => {
              await saveIdeaCheck({ data: { id: report.id, saved: !saved } })
              setSaved(!saved)
              router.invalidate()
            }}
            className="inline-flex h-10 items-center gap-2 rounded-full border border-control px-4 text-sm hover:bg-surface"
          >
            {saved ? <BookmarkCheck className="size-4 text-glaze" /> : <Bookmark className="size-4" />} {saved ? 'Saved' : 'Save'}
          </button>
        </div>
      </div>

      <section aria-labelledby="verdict" className="mt-10 border-t border-ink pt-8">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div>
            <h1 id="verdict" className="text-[clamp(2.75rem,6vw,5rem)] leading-[0.95]">
              {verdict}
            </h1>
            <p className="mt-4 max-w-[60ch] text-lg leading-8 text-ink-2">
              {n === 0
                ? report.weakTotal > 0
                  ? `No startup shares more than one word with your idea. ${report.weakTotal} share a single word, which is not enough to call them precedents.`
                  : 'No startup in the registry uses the words of your idea.'
                : `${n} ${n === 1 ? 'startup shares' : 'startups share'} two or more words with your idea. The closest are below, each with the registry row it rests on.`}
            </p>
          </div>
          <dl className="grid grid-cols-3 gap-px self-end overflow-hidden rounded-md border border-hairline bg-hairline text-center">
            {[
              [n, 'close'],
              [report.weakTotal, 'one word'],
              [report.against - n - report.weakTotal, 'unrelated'],
            ].map(([v, k]) => (
              <div key={k} className="bg-surface px-3 py-3">
                <dt className="text-xs text-ink-2">{k}</dt>
                <dd className={cn('m-0 font-display text-3xl font-bold', k === 'close' && n > 0 && 'text-ochre-text')}>{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {lead.length > 0 && (
        <section aria-label="Closest startups" className="mt-12 grid gap-x-4 gap-y-8 lg:grid-cols-3">
          {lead.map((m) => (
            <div key={m.id} className="grid grid-rows-[1fr_auto] gap-4 [&>a]:mb-0 [&>a]:h-full">
              <Card card={card(m)} words={m.shared} lit size="lg" />
              <dl className="grid grid-cols-2 gap-4 px-1 text-sm">
                <div>
                  <dt className="text-ink-2">Same as your idea</dt>
                  <dd className="m-0 mt-1">{m.shared.join(', ')}</dd>
                </div>
                <div>
                  <dt className="text-ink-2">Not in its entry</dt>
                  <dd className="m-0 mt-1">{m.missing.length ? m.missing.join(', ') : 'everything matches'}</dd>
                </div>
              </dl>
            </div>
          ))}
        </section>
      )}

      {(more.length > 0 || report.weak.length > 0) && (
        <section aria-label="Also sharing words" className="mt-16">
          <div className="mb-5 flex items-baseline justify-between gap-4 border-t border-hairline pt-4 text-sm text-ink-2">
            <span>Also sharing words</span>
            <span>Highlighted: the words they share with your idea</span>
          </div>
          <div className="columns-1 gap-3 sm:columns-2 lg:columns-4">
            {more.map((m) => (
              <Card key={m.id} card={card(m)} words={m.shared} lit />
            ))}
            {report.weak.map((m) => (
              <Card key={m.id} card={card(m)} words={m.shared} />
            ))}
          </div>
        </section>
      )}

      {n === 0 && (
        <div className="mt-12 max-w-[64ch] rounded-md bg-surface px-6 py-5 leading-7">
          <strong className="font-medium">What a no-match means.</strong> No labelled startup in the Startup Tunisia registry describes this. Startups outside the registry are not here, so ask around before you count on being first.{' '}
          <Link to="/themes">See where few tried</Link>
        </div>
      )}

      <div className="mt-16 max-w-[44rem]">
        <p className="mb-3 text-sm text-ink-2">Ask about another idea</p>
        <AskForm compact />
      </div>
    </main>
  )
}
