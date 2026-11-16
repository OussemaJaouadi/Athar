import { Link } from '@tanstack/react-router'

import { ThemeToggle } from '@/components/athar/theme'

export const NAV = [
  { to: '/', label: 'Ask' },
  { to: '/search', label: 'Archive' },
  { to: '/landscape', label: 'Landscape' },
] as const

/** The reading room's one bar: brand, nav, then whatever the page adds (palette, role link) and the theme toggle. */
export function SiteHeader({ children }: { children?: React.ReactNode }) {
  return (
    <header className="sticky top-0 z-30 border-b border-hairline bg-canvas">
      <div className="flex flex-wrap items-center gap-x-4 px-4 sm:h-14 sm:flex-nowrap sm:gap-8 sm:px-8">
        <Link to="/" className="flex h-14 shrink-0 items-center gap-2 font-display text-lg font-semibold text-ink no-underline">
          <img src="/athar.svg" alt="" width={28} height={28} />
          Athar
        </Link>
        <nav aria-label="Main" className="order-last -mx-3 flex h-11 w-[calc(100%+1.5rem)] min-w-0 gap-1 sm:order-none sm:mx-0 sm:h-full sm:w-auto">
          {NAV.map((n) => (
            <Link
              key={n.to}
              activeOptions={{ exact: n.to === '/' }}
              to={n.to}
              className="flex h-full flex-1 items-center justify-center px-2 text-sm font-medium whitespace-nowrap text-ink-2 no-underline hover:text-ink data-[status=active]:text-ink data-[status=active]:shadow-[inset_0_-2px_0_var(--glaze)] sm:flex-none sm:px-3"
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="ms-auto flex shrink-0 items-center gap-3">
          {children}
          <ThemeToggle />
        </div>
      </div>
    </header>
  )
}
