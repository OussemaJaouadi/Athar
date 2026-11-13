import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({ component: MainApp })

// Main app: search, profiles, idea check, themes and charts land here.
function MainApp() {
  return (
    <main style={{ padding: '0 1.5rem' }}>
      <h1>Athar</h1>
      <p>Every fact about Tunisian startups, with its source beside it.</p>
    </main>
  )
}
