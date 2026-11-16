import { Link, Outlet, createFileRoute, redirect } from '@tanstack/react-router'
import { Database, Gauge, KeyRound, ListChecks, Play, Route as RouteIcon, type LucideIcon } from 'lucide-react'

import { LabInstruments } from '@/components/athar/lab'
import { getViewer } from '#/server/auth'

// The conservation lab: dense and instrument-like; raw rows are cleaned, matched and catalogued.
export const Route = createFileRoute('/portal')({
  beforeLoad: async () => {
    const viewer = await getViewer()
    if (viewer.role !== 'operator') throw redirect({ to: '/sign-in' })
  },
  component: Lab,
})

const NAV: { to: '/portal' | '/portal/runs' | '/portal/review' | '/portal/trace' | '/portal/database' | '/portal/keys'; label: string; icon: LucideIcon; exact?: boolean }[] = [
  { to: '/portal', label: 'Overview', icon: Gauge, exact: true },
  { to: '/portal/runs', label: 'Runs', icon: Play },
  { to: '/portal/review', label: 'Review queue', icon: ListChecks },
  { to: '/portal/trace', label: 'Trace a row', icon: RouteIcon },
  { to: '/portal/database', label: 'Database', icon: Database },
  { to: '/portal/keys', label: 'AI keys', icon: KeyRound },
]

function Lab() {
  return (
    <LabInstruments>
      <div className="min-h-dvh bg-surface text-sm md:grid md:grid-cols-[13rem_minmax(0,1fr)]">
        <aside className="sticky top-0 z-30 flex flex-col border-e border-hairline bg-canvas md:h-dvh">
          <Link to="/portal" className="flex items-center gap-2 px-4 py-3 text-ink no-underline md:py-4">
            <img src="/athar.svg" alt="" width={22} height={22} />
            <span className="grid leading-tight">
              <span className="font-display font-semibold">Conservation lab</span>
              <span className="font-mono text-[0.625rem] text-ink-2">Athar · operator</span>
            </span>
          </Link>
          <nav aria-label="Lab" className="flex gap-0.5 overflow-x-auto border-b border-hairline px-2 pb-2 md:grid md:border-0">
            {NAV.map(({ to, label, icon: Icon, exact }) => (
              <Link
                key={to}
                to={to}
                activeOptions={{ exact: Boolean(exact) }}
                className="flex items-center gap-2 rounded-sm px-2.5 py-1.5 whitespace-nowrap text-ink-2 no-underline hover:bg-surface hover:text-ink data-[status=active]:bg-surface-raised data-[status=active]:text-ink"
              >
                <Icon className="size-3.5" aria-hidden />
                {label}
              </Link>
            ))}
          </nav>
          <div className="mt-auto hidden border-t border-hairline px-4 py-3 md:block">
            <Link to="/search" className="text-xs">
              ← Reading room
            </Link>
          </div>
        </aside>
        <div className="min-w-0">
          <Outlet />
        </div>
      </div>
    </LabInstruments>
  )
}
