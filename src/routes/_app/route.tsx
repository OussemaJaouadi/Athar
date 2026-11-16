import { Link, Outlet, createFileRoute, useNavigate } from '@tanstack/react-router'
import { BookOpenText, ChartColumn, Grid3x3, Lightbulb, type LucideIcon } from 'lucide-react'
import { useMemo } from 'react'

import { SampleTag, shortDate } from '@/components/athar/kit'
import ActionSearchBar, { type CommandItem } from '@/components/kokonutui/action-search-bar'
import { cn } from '@/lib/utils'
import { getCorpus, getWall } from '#/server/api/app'
import { listIdeaChecks } from '#/server/api/sample'
import { getViewer } from '#/server/auth'

// The reading room: founders look up precedents. One building with the lab, a different room.
export const Route = createFileRoute('/_app')({
  loader: async () => {
    const [viewer, wall, corpus, ideas] = await Promise.all([getViewer(), getWall(), getCorpus(), listIdeaChecks()])
    return { viewer, wall, corpus, ideas }
  },
  component: ReadingRoom,
})

const NAV: { to: '/search' | '/idea' | '/themes' | '/landscape'; label: string; icon: LucideIcon }[] = [
  { to: '/search', label: 'Archive', icon: BookOpenText },
  { to: '/idea', label: 'Idea check', icon: Lightbulb },
  { to: '/themes', label: 'Themes & gaps', icon: Grid3x3 },
  { to: '/landscape', label: 'Landscape', icon: ChartColumn },
]

function ReadingRoom() {
  const { viewer, wall, corpus, ideas } = Route.useLoaderData()
  const navigate = useNavigate()
  const items = useMemo<CommandItem[]>(
    () => [
      ...NAV.map((n) => ({ id: `page:${n.to}`, label: n.label, group: 'Pages', href: n.to })),
      ...wall.map((t) => ({ id: t.id, label: t.name, group: t.sector ?? 'Unknown', keywords: t.sector ? [t.sector] : [] })),
    ],
    [wall],
  )
  const open = (item: CommandItem) =>
    item.href ? navigate({ to: item.href }) : navigate({ to: '/startups/$id', params: { id: item.id } })

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[15rem_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-dvh flex-col border-e border-hairline bg-surface lg:flex">
        <Link to="/search" className="flex items-center gap-2.5 px-5 pt-5 pb-6 text-ink no-underline">
          <img src="/athar.svg" alt="" width={28} height={28} />
          <span className="font-display text-lg font-semibold">Athar</span>
          <span className="font-display text-ink-2" lang="ar">
            أثر
          </span>
        </Link>

        <nav aria-label="Reading room" className="grid gap-0.5 px-3">
          {NAV.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-ink-2 no-underline hover:bg-surface-raised hover:text-ink data-[status=active]:bg-canvas data-[status=active]:font-medium data-[status=active]:text-ink data-[status=active]:shadow-[inset_2px_0_0_var(--ochre)]"
            >
              <Icon className="size-4" aria-hidden />
              <span className="flex-1">{label}</span>
              {to === '/search' && <span className="font-mono text-[0.6875rem] tabular-nums">{corpus.startups}</span>}
            </Link>
          ))}
        </nav>

        <div className="mt-6 grid gap-1 px-3">
          <div className="flex items-center justify-between px-2.5 pb-1">
            <span className="font-mono text-[0.625rem] tracking-wide text-ink-2 uppercase">Saved idea checks</span>
            <SampleTag />
          </div>
          {ideas.checks.slice(0, 5).map((c) => (
            <Link key={c.id} to="/idea" search={{ check: c.id }} className="grid gap-0.5 rounded-md px-2.5 py-1.5 text-xs no-underline hover:bg-surface-raised">
              <span className="line-clamp-2 text-ink">{c.idea}</span>
              <span className="font-mono text-[0.625rem] text-ink-2">{c.total === 0 ? 'no match' : `${c.close} close · ${c.total} found`}</span>
            </Link>
          ))}
        </div>

        <div className="mt-auto grid gap-3 border-t border-hairline px-5 py-4 text-xs text-ink-2">
          <div className="grid gap-0.5 font-mono text-[0.6875rem]">
            <span>Startup Tunisia registry</span>
            <span>
              {corpus.rows} rows → {corpus.startups} startups
            </span>
            <span>{corpus.fetchedAt ? `snapshot ${shortDate(corpus.fetchedAt)}` : 'not collected yet'}</span>
          </div>
          {viewer.role === 'operator' ? (
            <Link to="/portal" className="text-sm">
              Conservation lab →
            </Link>
          ) : (
            <Link to="/sign-in" className="text-sm">
              Sign in
            </Link>
          )}
        </div>
      </aside>

      <div className="min-w-0">
        <div className="sticky top-0 z-30 border-b border-hairline bg-canvas/95 backdrop-blur-sm">
          <div className="flex items-center gap-3 px-4 py-2.5 sm:px-6 lg:px-8">
            <Link to="/search" className="flex shrink-0 items-center gap-2 text-ink no-underline lg:hidden">
              <img src="/athar.svg" alt="" width={24} height={24} />
              <span className="font-display font-semibold">Athar</span>
            </Link>
            <nav aria-label="Reading room" className="-mx-1 flex min-w-0 gap-1 overflow-x-auto lg:hidden">
              {NAV.map(({ to, label }) => (
                <Link key={to} to={to} className="rounded-md px-2 py-1 text-sm whitespace-nowrap text-ink-2 no-underline data-[status=active]:bg-surface data-[status=active]:text-ink">
                  {label}
                </Link>
              ))}
            </nav>
            <div className={cn('ms-auto hidden w-full max-w-md sm:block')}>
              {items.length > NAV.length && <ActionSearchBar items={items} label="Find a startup" placeholder="Jump to a startup or a page" shortcut onSelect={open} />}
            </div>
          </div>
        </div>
        <Outlet />
      </div>
    </div>
  )
}
