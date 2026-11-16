import { Link, Outlet, createFileRoute, redirect } from '@tanstack/react-router'

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

const NAV = [
  { to: '/portal/runs', label: 'Runs' },
  { to: '/portal/database', label: 'Database' },
  { to: '/portal/keys', label: 'Keys' },
] as const

function Lab() {
  return (
    <LabInstruments>
      <div className="min-h-dvh bg-surface text-sm">
        <header className="border-b border-hairline bg-zinc-900 text-zinc-100">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-5 py-2.5">
            <Link to="/portal/runs" className="flex items-center gap-2 text-zinc-100 no-underline">
              <img src="/athar-dark.svg" alt="" width={22} height={22} />
              <span className="font-display font-semibold">Conservation lab</span>
            </Link>
            <nav aria-label="Lab" className="flex gap-4">
              {NAV.map((n) => (
                <Link key={n.to} to={n.to} className="text-zinc-400 no-underline hover:text-zinc-100 data-[status=active]:text-zinc-100">
                  {n.label}
                </Link>
              ))}
            </nav>
            <Link to="/search" className="ms-auto text-zinc-400 no-underline hover:text-zinc-100">
              Reading room
            </Link>
          </div>
        </header>
        <Outlet />
      </div>
    </LabInstruments>
  )
}
