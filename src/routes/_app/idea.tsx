import { createFileRoute } from '@tanstack/react-router'

import { Button } from '@/components/ui/button'
import { getEmbeddingCount } from '#/server/api/app'

export const Route = createFileRoute('/_app/idea')({
  loader: () => getEmbeddingCount(),
  component: IdeaPage,
})

// Idea check: describe an idea; the archivist finds precedents and shows the chain for each.
function IdeaPage() {
  const embedded = Route.useLoaderData()
  return (
    <main className="mx-auto grid max-w-3xl gap-8 px-6 py-12">
      <header className="grid gap-2">
        <h1 className="text-4xl font-semibold text-balance">Was it tried before?</h1>
        <p className="text-ink-2">Describe your idea in Arabic, French or English. Athar looks for startups in the archive that tried something close, and shows the record behind every match.</p>
      </header>
      <form className="grid gap-3" onSubmit={(e) => e.preventDefault()}>
        <label htmlFor="idea" className="text-sm text-ink-2">
          Your idea
        </label>
        <textarea id="idea" name="idea" rows={5} className="rounded-md border border-input bg-background p-3 text-base" placeholder="A marketplace where olive farmers sell directly to restaurants" />
        <div>
          <Button type="submit" disabled={embedded === 0} className="h-10 px-5">
            Search for precedents
          </Button>
        </div>
      </form>
      {embedded === 0 && <p className="border-s-2 border-ochre ps-4 text-sm text-ink-2">The archive isn&apos;t indexed for ideas yet. An operator runs Embed in the conservation lab first.</p>}
    </main>
  )
}
