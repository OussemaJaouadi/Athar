import { Link, Outlet, createFileRoute, useNavigate } from '@tanstack/react-router'
import { useMemo } from 'react'

import ActionSearchBar, { type CommandItem } from '@/components/kokonutui/action-search-bar'
import { getWall } from '#/server/api/app'
import { getViewer } from '#/server/auth'

// The reading room: calm and spacious; founders look up precedents.
export const Route = createFileRoute('/_app')({
  loader: async () => ({ viewer: await getViewer(), wall: await getWall() }),
  component: ReadingRoom,
})

const NAV = [
  { to: '/search', label: 'Archive' },
  { to: '/idea', label: 'Idea check' },
  { to: '/themes', label: 'Themes' },
  { to: '/landscape', label: 'Landscape' },
] as const

function ReadingRoom() {
  const { viewer, wall } = Route.useLoaderData()
  const navigate = useNavigate()
  const items = useMemo<CommandItem[]>(
    () => wall.map((t) => ({ id: t.id, label: t.name, group: t.sector ?? 'Unknown', keywords: t.sector ? [t.sector] : [] })),
    [wall],
  )

  return (
    <div className="min-h-dvh">
      <header className="border-b border-hairline">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-8 gap-y-3 px-6 py-4">
          <Link to="/search" className="flex items-center gap-2.5 text-ink no-underline">
            <img src="/athar.svg" alt="" width={30} height={30} />
            <span className="font-display text-lg font-semibold">Athar</span>
            <span className="hidden font-display text-ink-2 sm:inline" lang="ar">
              أثر
            </span>
          </Link>
          <nav aria-label="Reading room" className="flex flex-wrap gap-5 text-sm">
            {NAV.map((n) => (
              <Link key={n.to} to={n.to} className="text-ink-2 no-underline hover:text-ink data-[status=active]:text-ink data-[status=active]:font-medium">
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="ms-auto flex min-w-0 items-center gap-4">
            {items.length > 0 && (
              <ActionSearchBar
                items={items}
                label="Find a startup"
                placeholder="Find a startup by name or sector"
                className="w-72 max-w-full"
                onSelect={(item) => navigate({ to: '/startups/$id', params: { id: item.id } })}
              />
            )}
            {viewer.role === 'operator' ? (
              <Link to="/portal/runs" className="text-sm whitespace-nowrap">
                Conservation lab
              </Link>
            ) : (
              <Link to="/sign-in" className="text-sm whitespace-nowrap">
                Sign in
              </Link>
            )}
          </div>
        </div>
      </header>
      <Outlet />
    </div>
  )
}
