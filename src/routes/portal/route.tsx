import { Link, Outlet, createFileRoute, redirect } from '@tanstack/react-router'
import { KeyRound } from 'lucide-react'

import { LabInstruments } from '@/components/athar/lab'
import { ThemeToggle } from '@/components/athar/theme'
import { getViewer } from '#/server/auth'
import { listKeys } from '#/server/api/portal'

export const Route = createFileRoute('/portal')({
  beforeLoad: async () => {
    const viewer = await getViewer()
    if (viewer.role !== 'operator') throw redirect({ to: '/sign-in' })
  },
  loader: () => listKeys(),
  component: Lab,
})

const NAV = [
  { to: '/portal', label: 'Overview' },
  { to: '/portal/runs', label: 'Runs' },
  { to: '/portal/review', label: 'In review' },
  { to: '/portal/trace', label: 'Trace' },
  { to: '/portal/database', label: 'Database' },
  { to: '/portal/keys', label: 'Keys' },
] as const

function Lab() {
  const keys = Route.useLoaderData()
  const active = keys.find((key) => key.status === 'active')
  return (
    <LabInstruments>
      <div className="min-h-dvh bg-canvas text-sm text-ink [&_a]:underline-offset-4 [&_main]:mx-auto [&_main]:w-full [&_main]:max-w-[1440px] [&_main]:content-start [&_main]:pb-20">
        <header className="flex min-h-14 flex-wrap items-center gap-x-5 border-b border-hairline bg-surface px-4 lg:px-6">
          <Link
            to="/portal"
            className="flex h-14 shrink-0 items-center gap-2 text-ink no-underline"
          >
            <img src="/athar.svg" alt="" width={26} height={26} />
            <span className="font-display text-lg font-semibold">Athar</span>
            <span className="ms-1 border-s border-hairline ps-3 text-sm text-ink-2">
              Operator
            </span>
          </Link>
          <nav
            aria-label="Operator"
            className="order-3 -mx-4 flex w-[calc(100%+2rem)] lg:order-none lg:mx-0 lg:w-auto"
          >
            {NAV.map(({ to, label }) => (
              <Link
                key={to}
                to={to}
                activeOptions={{ exact: to === '/portal' }}
                className="flex h-11 flex-1 items-center justify-center border-b-2 border-transparent px-1 text-[0.8125rem] whitespace-nowrap sm:text-sm lg:h-14 lg:flex-none lg:px-3 text-ink-2 no-underline hover:text-ink data-[status=active]:border-glaze data-[status=active]:text-ink"
              >
                {label}
              </Link>
            ))}
          </nav>
          <div className="ms-auto flex items-center gap-4">
            <span className="hidden max-w-80 items-center gap-2 text-ink-2 xl:inline-flex">
              <KeyRound className="size-3.5 shrink-0" aria-hidden />
              <span className="truncate">
                {active
                  ? `Key ${active.name} active · ${keys.length} ${keys.length === 1 ? 'key' : 'keys'}`
                  : keys.length
                    ? `No active key · ${keys.length} ${keys.length === 1 ? 'key' : 'keys'}`
                    : 'No AI key yet'}
              </span>
            </span>
            <Link to="/search" className="text-glaze underline">
              Reading room
            </Link>
            <ThemeToggle className="size-10" />
          </div>
        </header>
        <Outlet />
      </div>
    </LabInstruments>
  )
}
