import { createFileRoute } from '@tanstack/react-router'

import { getEmbeddingCount } from '#/server/api/app'

export const Route = createFileRoute('/_app/idea')({
  loader: () => getEmbeddingCount(),
  component: IdeaPage,
})

// Idea check: describe an idea, find related startups with sources, or an explicit "no match".
function IdeaPage() {
  const embedded = Route.useLoaderData()
  return (
    <main className="page">
      <h1>Idea check</h1>
      <form className="list" onSubmit={(e) => e.preventDefault()}>
        <label htmlFor="idea">Describe your idea in Arabic, French or English</label>
        <textarea id="idea" className="field" name="idea" />
        <div>
          <button className="btn" type="submit" disabled={embedded === 0}>
            Check idea
          </button>
        </div>
      </form>
      {embedded === 0 && <p className="muted">Matching needs embeddings. An operator runs Embed from the portal first.</p>}
    </main>
  )
}
