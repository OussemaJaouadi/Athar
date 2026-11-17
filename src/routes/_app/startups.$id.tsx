import { Link, createFileRoute, getRouteApi, notFound } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'

import { StartupRecord } from '@/components/athar/startup-record'
import { getStartupPage } from '#/server/api/startup'

const shell = getRouteApi('/_app')

export const Route = createFileRoute('/_app/startups/$id')({
  loader: async ({ params }) => {
    const data = await getStartupPage({ data: params.id })
    if (!data) throw notFound()
    return data
  },
  head: ({ loaderData }) => ({ meta: loaderData ? [{ title: `${loaderData.startup.name} · Athar` }] : [] }),
  component: StartupPage,
})

// One startup: its record on the left, everything the data connects to it on the right.
function StartupPage() {
  const data = Route.useLoaderData()
  const { viewer } = shell.useLoaderData()
  return (
    <main className="mx-auto w-full max-w-[84rem] px-4 pb-20 sm:px-8">
      <div className="pt-5 pb-8">
        <Link to="/search" search={{ open: data.startup.id }} className="inline-flex items-center gap-1.5 text-sm">
          <ArrowLeft className="size-4" aria-hidden /> Back to search
        </Link>
      </div>
      <StartupRecord data={data} operator={viewer.role === 'operator'} />
    </main>
  )
}
