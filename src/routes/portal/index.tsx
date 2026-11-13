import { createFileRoute } from '@tanstack/react-router'

import { getStatus } from '#/server/status'

export const Route = createFileRoute('/portal/')({
  loader: () => getStatus(),
  component: Portal,
})

// Operator portal: runs, trace, database view and keys land here.
function Portal() {
  const status = Route.useLoaderData()
  return (
    <main style={{ padding: '0 1.5rem' }}>
      <h1>Operator portal</h1>
      <p>
        Storage: SQLite {status.sqlite} with sqlite-vec {status.vec}
      </p>
    </main>
  )
}
