import { createFileRoute, notFound } from '@tanstack/react-router'

import { IdeaRecord } from '@/components/athar/idea-record'
import { getIdea } from '#/server/api/ideas'

export const Route = createFileRoute('/_app/ideas/$id')({
  loader: async ({ params }) => {
    const data = await getIdea({ data: params.id })
    if (!data) throw notFound()
    return data
  },
  head: () => ({ meta: [{ title: 'Idea check · Athar' }] }),
  component: IdeaCheckPage,
})

// One idea check: the idea, and what the registry held about it when it was checked.
function IdeaCheckPage() {
  const data = Route.useLoaderData()
  return (
    <main className="mx-auto w-full max-w-[84rem] px-4 pt-10 pb-20 sm:px-8">
      <IdeaRecord key={data.id} data={data} />
    </main>
  )
}
