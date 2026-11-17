import { Outlet, createFileRoute, redirect } from '@tanstack/react-router'
import { Activity, Building2, GitCompare, KeyRound, Lightbulb, SearchCheck, Table2 } from 'lucide-react'

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
  { to: '/portal', label: 'Status', Icon: Activity, exact: true, also: ['/portal/runs'] },
  { to: '/portal/quality', label: 'Quality', Icon: SearchCheck },
  { to: '/portal/changes', label: 'Changes', Icon: GitCompare },
  { to: '/portal/startups', label: 'Startups', Icon: Building2, also: ['/portal/entries', '/portal/trace'] },
  { to: '/portal/ideas', label: 'Ideas', Icon: Lightbulb },
  { to: '/portal/keys', label: 'Keys', Icon: KeyRound },
  { to: '/portal/database', label: 'Raw tables', Icon: Table2 },
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
