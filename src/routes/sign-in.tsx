import { createFileRoute, useNavigate } from '@tanstack/react-router'

import { signIn } from '#/server/auth'

export const Route = createFileRoute('/sign-in')({ component: SignInPage })

// Placeholder: choose a role. Real operator creation is decided later.
function SignInPage() {
  const navigate = useNavigate()
  return (
    <main className="page">
      <h1>Sign in</h1>
      <p className="muted">Placeholder until the first-operator setup is decided.</p>
      <div className="row">
        <button
          className="btn"
          onClick={async () => {
            await signIn({ data: 'operator' })
            navigate({ to: '/portal/runs' })
          }}
        >
          Continue as operator
        </button>
        <button
          className="btn secondary"
          onClick={async () => {
            await signIn({ data: 'user' })
            navigate({ to: '/search' })
          }}
        >
          Continue as user
        </button>
      </div>
    </main>
  )
}
