import { createFileRoute, useNavigate } from '@tanstack/react-router'

import { Button } from '@/components/ui/button'
import { signIn } from '#/server/auth'

export const Route = createFileRoute('/sign-in')({ component: SignInPage })

// Placeholder: choose a room. How the first operator is created is still open.
function SignInPage() {
  const navigate = useNavigate()
  return (
    <main className="mx-auto grid min-h-dvh max-w-xl content-center gap-6 px-6">
      <img src="/athar.svg" alt="" width={48} height={48} />
      <h1 className="text-3xl font-semibold">Enter Athar</h1>
      <p className="text-ink-2">Placeholder sign-in until the first-operator setup is decided.</p>
      <div className="flex flex-wrap gap-3">
        <Button
          className="h-10 px-5"
          onClick={async () => {
            await signIn({ data: 'user' })
            navigate({ to: '/search' })
          }}
        >
          Reading room
        </Button>
        <Button
          variant="outline"
          className="h-10 px-5"
          onClick={async () => {
            await signIn({ data: 'operator' })
            navigate({ to: '/portal/runs' })
          }}
        >
          Conservation lab
        </Button>
      </div>
    </main>
  )
}
