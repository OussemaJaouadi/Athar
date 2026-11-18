import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'
import { useState } from 'react'

import { ThemeToggle } from '@/components/athar/theme'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { getViewer, signIn } from '#/server/auth'

export const Route = createFileRoute('/sign-in')({
  loader: async () => ({ passphraseSet: (await getViewer()).passphraseSet }),
  component: SignInPage,
})

const ROOMS = [
  { role: 'user' as const, to: '/search' as const, title: 'Search the registry', body: 'Look up startups, read each one with its source, and check an idea against all of them.' },
  { role: 'operator' as const, to: '/portal' as const, title: 'Run the operator portal', body: 'Collect the registry, follow a row through every step, and settle what is in review.' },
]

// Entering a self-hosted install. Accounts are not decided yet, so this picks the role for this browser.
function SignInPage() {
  const navigate = useNavigate()
  const { passphraseSet } = Route.useLoaderData()
  const [asking, setAsking] = useState(false)
  const [passphrase, setPassphrase] = useState('')
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)

  const enter = async (room: (typeof ROOMS)[number], phrase?: string) => {
    setSending(true)
    setError('')
    try {
      const result = await signIn({ data: { role: room.role, passphrase: phrase } })
      if (!result.ok) return setError(result.error)
      await navigate({ to: room.to })
    } finally {
      setSending(false)
    }
  }

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
                aria-expanded={r.role === 'operator' && passphraseSet ? asking : undefined}
                onClick={() => (r.role === 'operator' && passphraseSet ? setAsking(true) : enter(r))}
                className="group grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-6 gap-y-1 py-5 text-start"
              >
                <span className="font-display text-xl font-medium group-hover:text-glaze">{r.title}</span>
                <ArrowRight className="row-span-2 size-5 text-ink-2 transition-transform duration-150 group-hover:translate-x-1 motion-reduce:transition-none group-hover:text-glaze" aria-hidden />
                <span className="text-sm text-ink">{r.body}</span>
              </button>
              {r.role === 'operator' && passphraseSet && asking && (
                <form
                  className="pb-5"
                  onSubmit={(e) => {
                    e.preventDefault()
                    if (!sending) enter(r, passphrase)
                  }}
                >
                  <Field data-invalid={error ? true : undefined} className="max-w-[24rem]">
                    <FieldLabel htmlFor="operator-passphrase">Operator passphrase</FieldLabel>
                    <Input
                      id="operator-passphrase"
                      type="password"
                      autoComplete="current-password"
                      autoFocus
                      value={passphrase}
                      onChange={(e) => setPassphrase(e.target.value)}
                      aria-invalid={error ? true : undefined}
                      aria-describedby={error ? 'operator-passphrase-error' : undefined}
                    />
                    {error && <FieldError id="operator-passphrase-error">{error}</FieldError>}
                    <Button type="submit" disabled={sending || !passphrase} className="self-start">
                      Open the operator portal
                    </Button>
                  </Field>
                </form>
              )}
            </li>
          ))}
        </ul>
        <p className="text-sm text-ink-2">
          {passphraseSet
            ? 'The operator portal on this install is protected by a passphrase.'
            : 'This install has no passphrase, so anyone who can open it can run the portal; set ATHAR_OPERATOR_PASSPHRASE to require one.'}
        </p>
      </main>
    </div>
  )
}
