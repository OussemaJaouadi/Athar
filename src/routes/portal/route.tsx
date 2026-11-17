import { Outlet, createFileRoute, redirect } from '@tanstack/react-router'
import { Activity, Building2, Lightbulb } from 'lucide-react'

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

// Three tabs, one per thing the operator works on. What each download changed lives inside Status (Collect); the
// quality facts are filters on Startups; AI keys and the raw tables are in the account menu.
const NAV: NavItem[] = [
  { to: '/portal', label: 'Status', Icon: Activity, exact: true, also: ['/portal/runs', '/portal/changes'] },
  { to: '/portal/startups', label: 'Startups', Icon: Building2, also: ['/portal/entries', '/portal/trace', '/portal/quality'] },
  { to: '/portal/ideas', label: 'Ideas', Icon: Lightbulb },
]

// The operator's room: the same bar as the reading room, its own tabs, and the account menu.
function Lab() {
  return (
    <LabInstruments>
      <div className="flex h-dvh flex-col bg-canvas text-[0.875rem] text-ink [&_a]:underline-offset-[3px]">
        <SiteHeader nav={NAV} home="/portal" mark="Operator" compact iconTabs>
          <AccountMenu role="operator" room="operator" />
        </SiteHeader>
        <Outlet />
      </div>
    </LabInstruments>
  )
}
