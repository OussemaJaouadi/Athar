import { Outlet, createFileRoute, redirect } from '@tanstack/react-router'
import { Database, KeyRound, LayoutDashboard, ListChecks, Route as RouteIcon, Workflow } from 'lucide-react'

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
  { to: '/portal', label: 'Overview', Icon: LayoutDashboard, exact: true },
  { to: '/portal/runs', label: 'Runs', Icon: Workflow },
  { to: '/portal/review', label: 'Review', Icon: ListChecks },
  { to: '/portal/trace', label: 'Trace', Icon: RouteIcon },
  { to: '/portal/database', label: 'Database', Icon: Database },
  { to: '/portal/keys', label: 'Keys', Icon: KeyRound },
]

// The operator's room: the same bar as the reading room, its own tabs, and the account menu.
function Lab() {
  return (
    <LabInstruments>
      <div className="flex min-h-dvh flex-col bg-canvas text-sm text-ink [&_a]:underline-offset-4 [&_main]:mx-auto [&_main]:w-full [&_main]:max-w-[1440px] [&_main]:content-start [&_main]:pb-20">
        <SiteHeader nav={NAV} home="/portal" mark="Operator">
          <AccountMenu role="operator" room="operator" />
        </SiteHeader>
        <Outlet />
      </div>
    </LabInstruments>
  )
}
