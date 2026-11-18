import { Link, createFileRoute, getRouteApi } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'

import { AskForm } from '@/components/athar/ask-form'
import { TileMark } from '@/components/athar/tile-mark'
import { cn } from '@/lib/utils'
import { getWallCards, type RegistryCard } from '#/server/api/app'

type Search = { draft?: string }
const shell = getRouteApi('/_app')

export const Route = createFileRoute('/_app/')({
  validateSearch: (s: Record<string, unknown>): Search => ({
    draft: typeof s.draft === 'string' ? s.draft : undefined,
  }),
  loader: async () => ({ cards: await getWallCards({ data: { perSector: 3 } }) }),
  component: Home,
})


const longDate = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })

// Home: ask the registry. The check opens on its own page (/ideas/<id>); before asking, the wall of startups.
function Home() {
  const { cards } = Route.useLoaderData()
  const { draft } = Route.useSearch()
  return <Ask cards={cards} draft={draft} />
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
        <div className="mt-12 max-w-[64rem]">
          <AskForm initial={draft} />
        </div>
      </section>

      <section aria-label="The registry" className="mx-auto w-full max-w-[90rem] px-4 pb-20 sm:px-8">
        <div className="mb-6 flex flex-wrap items-baseline justify-between gap-x-8 gap-y-2 border-t border-hairline pt-5 text-sm text-ink-2">
          <p className="max-w-[44rem] text-lg leading-8 text-ink">
            Athar reads all {corpus.startups} startups in the Startup Tunisia registry and answers with the registry entry each one comes from.
          </p>
          <span>
            {corpus.startups} startups{corpus.fetchedAt && ` · downloaded ${longDate(corpus.fetchedAt)}`}
          </span>
        </div>
        <div className="relative max-h-[52rem] overflow-hidden">
          <Wall cards={cards} />
          <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-56 bg-gradient-to-b from-transparent to-canvas" />
        </div>
        <div className="mt-2 flex justify-center">
          <Link to="/search" className="inline-flex min-h-11 items-center gap-2 rounded-full border border-edge px-5 py-2.5 text-[0.9375rem] text-ink no-underline hover:bg-surface">
            Browse all {corpus.startups} <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>
      </section>
    </main>
  )
}

const OFFSETS = ['lg:pt-0', 'lg:pt-16', 'lg:pt-6', 'lg:pt-24', 'lg:pt-10']

/** The registry as a pinned board: five offset columns of slips, read left to right. */
function Wall({ cards }: { cards: RegistryCard[] }) {
  const cols: RegistryCard[][] = [[], [], [], [], []]
  cards.forEach((c, i) => cols[i % 5].push(c))
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      {cols.map((col, i) => (
        <div key={i} className={cn('min-w-0', OFFSETS[i], i >= 2 && 'hidden lg:block', i === 1 && 'hidden sm:block')}>
          {col.map((c) => (
            <Card key={c.id} card={c} />
          ))}
        </div>
      ))}
    </div>
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
        'mb-3 block break-inside-avoid rounded-md border no-underline transition-colors motion-reduce:transition-none', size === 'lg' ? 'p-5' : 'p-3.5',
        lit ? 'border-ochre bg-canvas shadow-[0_0_0_1px_var(--ochre)]' : 'border-edge/70 bg-surface hover:border-ink',
      )}
    >
      <span className="flex items-center gap-2.5">
        <TileMark id={card.id} sector={card.sector} size={size === 'lg' ? 36 : 24} />
        <span className="flex min-w-0 flex-1 items-baseline justify-between gap-2 text-[0.8125rem]">
          <span className="truncate text-ink-2">{card.sector ?? 'No sector'}</span>
        </span>
      </span>
      <span className={cn('mt-3 block font-display font-bold text-ink', size === 'lg' ? 'text-2xl' : 'text-[1.0625rem] leading-6')}>{card.name}</span>
      {card.description && (
        <span dir="auto" className={cn('mt-1.5 block text-ink', size === 'lg' ? 'text-[0.9375rem] leading-6' : 'line-clamp-4 text-sm leading-[1.375rem]')}>
          {marked(decode(card.description), words)}
        </span>
      )}
    </Link>
  )
}

