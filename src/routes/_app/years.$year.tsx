import { createFileRoute, notFound } from '@tanstack/react-router'

import { YearRecord } from '@/components/athar/year-record'
import { getLabelYear } from '#/server/api/year'

export const Route = createFileRoute('/_app/years/$year')({
  loader: async ({ params }) => {
    const data = await getLabelYear({ data: params.year })
    if (!data) throw notFound()
    return data
  },
  head: ({ loaderData }) => ({ meta: loaderData ? [{ title: `Labelled in ${loaderData.year} · Athar` }] : [] }),
  component: YearPage,
})

// One label year: who was labelled, in which sectors, and what is left of them today.
function YearPage() {
  const data = Route.useLoaderData()
  return (
    <main className="mx-auto w-full max-w-[84rem] px-4 pt-10 pb-20 sm:px-8">
      <YearRecord data={data} />
    </main>
  )
}
