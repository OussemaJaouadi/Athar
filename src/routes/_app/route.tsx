import { Outlet, createFileRoute, useNavigate } from '@tanstack/react-router'
import { useCallback } from 'react'

import { AccountMenu } from '@/components/athar/account-menu'
import { SiteHeader } from '@/components/athar/site-header'
import ActionSearchBar, { type CommandItem } from '@/components/kokonutui/action-search-bar'
import { findStartups, getCorpus } from '#/server/api/app'
import { getViewer } from '#/server/auth'

// The reading room: founders look up precedents. One quiet bar; the page belongs to the work.
export const Route = createFileRoute('/_app')({
  loader: async () => {
    const [viewer, corpus] = await Promise.all([getViewer(), getCorpus()])
    return { viewer, corpus }
  },
  component: ReadingRoom,
})

function ReadingRoom() {
  const { viewer } = Route.useLoaderData()
  const navigate = useNavigate()
  // The server answers each question (name, sector or another name); the browser holds no list of startups.
  const search = useCallback(async (q: string, signal: AbortSignal): Promise<CommandItem[]> => {
    const { rows } = await findStartups({ data: { q, limit: 8 }, signal })
    return rows.map((r) => ({ id: r.id, label: r.name, hint: 'other' in r && r.other ? `also ${r.other}` : (r.sector ?? undefined) }))
  }, [])

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader>
        <div className="hidden w-72 md:block">
          <ActionSearchBar
            search={search}
            idleHeading="Latest labelled"
            foundHeading="Startups"
            label="Go to a startup"
            placeholder="Go to a startup"
            shortcut
            onSelect={(item) => navigate({ to: '/startups/$id', params: { id: item.id } })}
          />
        </div>
        <AccountMenu role={viewer.role} />
      </SiteHeader>
      <div className="flex min-h-0 flex-1 flex-col">
        <Outlet />
      </div>
    </div>
  )
}
