import { Link } from '@tanstack/react-router'
import type { LucideIcon } from 'lucide-react'

export type NavItem = { to: string; label: string; Icon?: LucideIcon; exact?: boolean }

export const NAV: NavItem[] = [
  { to: '/', label: 'Ask', exact: true },
  { to: '/search', label: 'Archive' },
  { to: '/landscape', label: 'Landscape' },
]

/**
 * The one bar for both rooms: brand (with an optional mark such as "Operator"), the room's nav, then whatever the
 * page adds (search, account menu).
 */
export function SiteHeader({ children, nav = NAV, home = '/', mark }: { children?: React.ReactNode; nav?: NavItem[]; home?: string; mark?: string }) {
  return (
    <header className="sticky top-0 z-30 border-b border-hairline bg-canvas">
      <div className="flex flex-wrap items-center gap-x-4 px-4 sm:h-14 sm:flex-nowrap sm:gap-8 sm:px-8">
        <Link to={home} className="flex h-14 shrink-0 items-center gap-2 font-display text-lg font-semibold text-ink no-underline">
          <img src="/athar.svg" alt="" width={28} height={28} />
          Athar
          {mark && <span className="ms-1 border-s border-edge ps-3 font-sans text-sm font-medium text-ink-2">{mark}</span>}
        </Link>
        <nav aria-label="Main" className="order-last -mx-3 flex h-11 w-[calc(100%+1.5rem)] min-w-0 gap-1 overflow-x-auto sm:order-none sm:mx-0 sm:h-full sm:w-auto">
          {nav.map(({ to, label, Icon, exact }) => (
            <Link
              key={to}
              activeOptions={{ exact: exact ?? to === home }}
              to={to}
              className="flex h-full flex-1 items-center justify-center gap-2 px-2 text-sm font-medium whitespace-nowrap text-ink-2 no-underline hover:text-ink data-[status=active]:text-ink data-[status=active]:shadow-[inset_0_-2px_0_var(--glaze)] sm:flex-none sm:px-3"
            >
              {Icon && <Icon className="size-4" strokeWidth={1.5} aria-hidden />}
              {label}
            </Link>
          ))}
        </nav>
        <div className="ms-auto flex shrink-0 items-center gap-3">{children}</div>
      </div>
    </header>
  )
}
