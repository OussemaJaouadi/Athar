import { Link, useRouterState } from '@tanstack/react-router'
import type { LucideIcon } from 'lucide-react'

import { cn } from '@/lib/utils'

/** `also`: other path prefixes that belong to this tab (a run page under Pipeline). */
export type NavItem = { to: string; label: string; Icon?: LucideIcon; exact?: boolean; also?: string[] }

export const NAV: NavItem[] = [
  { to: '/', label: 'Ask', exact: true },
  { to: '/search', label: 'Archive' },
  { to: '/landscape', label: 'Landscape' },
]

/**
 * The one bar for both rooms: brand (with an optional mark such as "Operator"), the room's nav, then whatever the
 * page adds (search, account menu).
 */
export function SiteHeader({ children, nav = NAV, home = '/', mark, compact, iconTabs }: { children?: React.ReactNode; nav?: NavItem[]; home?: string; mark?: string; compact?: boolean; iconTabs?: boolean }) {
  const path = useRouterState({ select: (s) => s.location.pathname })
  return (
    <header className="sticky top-0 z-30 shrink-0 border-b border-hairline bg-canvas">
      <div className={cn('flex flex-wrap items-center gap-x-4 px-4 sm:flex-nowrap sm:gap-8', compact ? 'sm:h-12 sm:px-5' : 'sm:h-14 sm:px-8')}>
        <Link to={home} className={cn('flex shrink-0 items-center gap-2 font-display text-lg font-semibold text-ink no-underline', compact ? 'h-12' : 'h-14')}>
          <img src="/athar.svg" alt="" width={28} height={28} />
          Athar
          {mark && <span className="ms-1 border-s border-edge ps-3 font-sans text-sm font-medium text-ink-2">{mark}</span>}
        </Link>
        <nav aria-label="Main" className="order-last -mx-3 flex h-11 w-[calc(100%+1.5rem)] min-w-0 gap-1 overflow-x-auto sm:order-none sm:mx-0 sm:h-full sm:w-auto">
          {nav.map(({ to, label, Icon, exact, also }) => (
            <Link
              key={to}
              data-also={also?.some((p) => path.startsWith(p)) || undefined}
              activeOptions={{ exact: exact ?? to === home }}
              to={to}
              className="group flex h-full flex-1 items-center justify-center gap-2 px-2 text-sm font-medium whitespace-nowrap text-ink-2 no-underline hover:text-ink data-[status=active]:text-ink data-[status=active]:shadow-[inset_0_-2px_0_var(--glaze)] data-also:text-ink data-also:shadow-[inset_0_-2px_0_var(--glaze)] sm:flex-none sm:px-3"
            >
              {Icon && <Icon className="size-4" strokeWidth={1.5} aria-hidden />}
              {/* With many tabs, narrow screens show icons and only the active tab's label. */}
              <span className={cn(iconTabs && 'max-[1099px]:sr-only max-[1099px]:group-data-[status=active]:not-sr-only max-[1099px]:group-data-also:not-sr-only')}>{label}</span>
            </Link>
          ))}
        </nav>
        <div className="ms-auto flex shrink-0 items-center gap-3">{children}</div>
      </div>
    </header>
  )
}
