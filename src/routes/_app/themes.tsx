import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_app/themes')({ component: ThemesPage })

// Themes and white space: startups grouped by what they actually do, and where few tried.
function ThemesPage() {
  return (
    <main className="page">
      <h1>Themes</h1>
      <p className="muted">Themes are grouped from embeddings. They appear after an operator runs Embed.</p>
    </main>
  )
}
