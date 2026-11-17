import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'

import { ThemeToggle } from '@/components/athar/theme'
import { signIn } from '#/server/auth'

export const Route = createFileRoute('/sign-in')({ component: SignInPage })

const ROOMS = [
  { role: 'user' as const, to: '/search' as const, title: 'Search the registry', body: 'Look up startups, read each one with its source, and check an idea against all of them.' },
  { role: 'operator' as const, to: '/portal' as const, title: 'Run the operator portal', body: 'Collect the registry, follow a row through every step, and settle what is in review.' },
]

// Entering a self-hosted install. Accounts are not decided yet, so this picks the role for this browser.
function SignInPage() {
  const navigate = useNavigate()
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex h-14 items-center justify-between px-4 sm:px-8">
        <span className="flex items-center gap-2 font-display text-lg font-semibold">
          <img src="/athar.svg" alt="" width={28} height={28} />
          Athar
        </span>
        <ThemeToggle />
      </header>
      <main className="mx-auto grid w-full max-w-[44rem] flex-1 content-start gap-10 px-4 pt-16 pb-16 sm:px-8 sm:pt-28">
        <div>
          <h1 className="text-[2.25rem] leading-[2.75rem] tracking-[-0.015em]">
            Tunisian startups, <span>each with the registry row it came from.</span>
          </h1>
          <p className="mt-4 max-w-[56ch] text-ink">Choose how you use this install. You can switch at any time from the top bar.</p>
        </div>
        <ul className="m-0 grid list-none border-t border-control p-0">
          {ROOMS.map((r) => (
            <li key={r.role} className="border-b border-hairline">
              <button
                type="button"
                onClick={async () => {
                  await signIn({ data: r.role })
                  navigate({ to: r.to })
                }}
                className="group grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-6 gap-y-1 py-5 text-start"
              >
                <span className="font-display text-xl font-medium group-hover:text-glaze">{r.title}</span>
                <ArrowRight className="row-span-2 size-5 text-ink-2 transition-transform duration-150 group-hover:translate-x-1 motion-reduce:transition-none group-hover:text-glaze" aria-hidden />
                <span className="text-sm text-ink">{r.body}</span>
              </button>
            </li>
          ))}
        </ul>
        <p className="text-sm text-ink-2">Accounts are not set up on this install yet, so anyone using this browser can choose either role.</p>
      </main>
    </div>
  )
}
