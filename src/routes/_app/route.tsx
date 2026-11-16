import { Link, Outlet, createFileRoute, useNavigate } from '@tanstack/react-router'
import { useMemo } from 'react'

import { SiteHeader } from '@/components/athar/site-header'
import ActionSearchBar, { type CommandItem } from '@/components/kokonutui/action-search-bar'
import { getCorpus, getWall } from '#/server/api/app'
import { getViewer } from '#/server/auth'

// The reading room: founders look up precedents. One quiet bar; the page belongs to the work.
export const Route = createFileRoute('/_app')({
  loader: async () => {
    const [viewer, wall, corpus] = await Promise.all([getViewer(), getWall(), getCorpus()])
    return { viewer, wall, corpus }
  },
  component: ReadingRoom,
})

function ReadingRoom() {
  const { viewer, wall } = Route.useLoaderData()
  const navigate = useNavigate()
  const items = useMemo<CommandItem[]>(
    () => wall.map((t) => ({ id: t.id, label: t.name, group: t.sector ?? 'No sector', keywords: t.sector ? [t.sector] : [] })),
    [wall],
  )

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader>
        {items.length > 0 && (
          <div className="hidden w-72 md:block">
            <ActionSearchBar items={items} label="Go to a startup" placeholder="Go to a startup" shortcut onSelect={(item) => navigate({ to: '/startups/$id', params: { id: item.id } })} />
          </div>
        )}
        <Link to={viewer.role === 'operator' ? '/portal' : '/sign-in'} className="text-sm whitespace-nowrap text-ink-2 no-underline hover:text-ink">
          {viewer.role === 'operator' ? 'Operator' : 'Sign in'}
        </Link>
      </SiteHeader>
      <div className="flex min-h-0 flex-1 flex-col">
        <Outlet />
      </div>
    </div>
  )
}
