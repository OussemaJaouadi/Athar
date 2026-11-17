import { createFileRoute, notFound } from '@tanstack/react-router'

import { PersonRecord } from '@/components/athar/person-record'
import { getPerson } from '#/server/api/person'

export const Route = createFileRoute('/_app/people/$slug')({
  loader: async ({ params }) => {
    const data = await getPerson({ data: params.slug })
    if (!data) throw notFound()
    return data
  },
  head: ({ loaderData }) => ({ meta: loaderData ? [{ title: `${loaderData.name} · Athar` }] : [] }),
  component: PersonPage,
})

// One person: the startups that name them as a founder, and who they founded with.
function PersonPage() {
  const data = Route.useLoaderData()
  return (
    <main className="mx-auto w-full max-w-[84rem] px-4 pt-10 pb-20 sm:px-8">
      <PersonRecord data={data} />
    </main>
  )
}
