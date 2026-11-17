import { createFileRoute, notFound } from '@tanstack/react-router'

import { SectorRecord } from '@/components/athar/sector-record'
import { getSector } from '#/server/api/sector'

export const Route = createFileRoute('/_app/sectors/$slug')({
  loader: async ({ params }) => {
    const data = await getSector({ data: params.slug })
    if (!data) throw notFound()
    return data
  },
  head: ({ loaderData }) => ({ meta: loaderData ? [{ title: `${loaderData.sector} · Athar` }] : [] }),
  component: SectorPage,
})

// One sector: how it moved over the label years and what is left of it today.
function SectorPage() {
  const data = Route.useLoaderData()
  return (
    <main className="mx-auto w-full max-w-[84rem] px-4 pt-10 pb-20 sm:px-8">
      <SectorRecord data={data} />
    </main>
  )
}
