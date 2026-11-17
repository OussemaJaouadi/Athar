import { Outlet, createFileRoute, redirect } from '@tanstack/react-router'
import { Database, KeyRound, Route as RouteIcon, Workflow } from 'lucide-react'

import { AccountMenu } from '@/components/athar/account-menu'
import { LabInstruments } from '@/components/athar/lab'
import { SiteHeader, type NavItem } from '@/components/athar/site-header'
import { getViewer } from '#/server/auth'

export const Route = createFileRoute('/portal')({
  beforeLoad: async () => {
    const viewer = await getViewer()
    if (viewer.role !== 'operator') throw redirect({ to: '/sign-in' })
  },
  component: Lab,
})

const NAV: NavItem[] = [
  { to: '/portal', label: 'Pipeline', Icon: Workflow, exact: true, also: ['/portal/runs'] },
  { to: '/portal/trace', label: 'Trace', Icon: RouteIcon },
  { to: '/portal/database', label: 'Database', Icon: Database },
  { to: '/portal/keys', label: 'Keys', Icon: KeyRound },
]

// The operator's room: the same bar as the reading room, its own tabs, and the account menu.
function Lab() {
  return (
    <LabInstruments>
      <div className="flex h-dvh flex-col bg-canvas text-[0.875rem] text-ink [&_a]:underline-offset-[3px]">
        <SiteHeader nav={NAV} home="/portal" mark="Operator" compact>
          <AccountMenu role="operator" room="operator" />
        </SiteHeader>
        <Outlet />
      </div>
    </LabInstruments>
  )
}
