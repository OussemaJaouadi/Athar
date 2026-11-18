import { createFileRoute, notFound } from '@tanstack/react-router'

import { PersonRecord } from '@/components/athar/person-record'
import { getPerson } from '#/server/api/person'
import { getPersonStory } from '#/server/api/story'

export const Route = createFileRoute('/_app/people/$slug')({
  loader: async ({ params }) => {
    const [data, story] = await Promise.all([getPerson({ data: params.slug }), getPersonStory({ data: params.slug.replace(/-/g, ' ') })])
    if (!data || !story) throw notFound()
    return { ...data, story }
  },
  head: ({ loaderData }) => ({ meta: loaderData ? [{ title: `${loaderData.story.name} · Athar` }] : [] }),
  component: PersonPage,
})

// One person: the startups that name them as a founder, and who they founded with.
function PersonPage() {
  const { story, ...data } = Route.useLoaderData()
  return (
    <main className="mx-auto w-full max-w-[84rem] px-4 pt-10 pb-20 sm:px-8">
      <PersonRecord data={data} story={story} />
    </main>
  )
}
