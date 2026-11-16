import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_app/themes')({ component: ThemesPage })

// Themes and white space: startups grouped by what they do, and the tiles nobody laid.
function ThemesPage() {
  return (
    <main className="mx-auto grid max-w-3xl gap-3 px-6 py-12">
      <h1 className="text-4xl font-semibold">Themes</h1>
      <p className="text-ink-2">Themes group startups by what they actually do, then show where few or none tried. They appear once the conservation lab has embedded the archive.</p>
    </main>
  )
}
