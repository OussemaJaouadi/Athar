import { Link, createFileRoute, getRouteApi, notFound } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'

import { Profile } from '@/components/athar/profile'
import { getStartup } from '#/server/api/app'

const shell = getRouteApi('/_app')

export const Route = createFileRoute('/_app/startups/$id')({
  loader: async ({ params }) => {
    const data = await getStartup({ data: params.id })
    if (!data) throw notFound()
    return data
  },
  component: ProfilePage,
})

// A profile on its own page: the phone view, and the link target from anywhere in the app.
function ProfilePage() {
  const data = Route.useLoaderData()
  const { viewer } = shell.useLoaderData()
  return (
    <main className="mx-auto w-full max-w-[100rem] px-4 pb-16 sm:px-8">
      <div className="pt-5 pb-6">
        <Link to="/search" search={{ open: data.startup.id }} className="inline-flex items-center gap-1.5 text-sm">
          <ArrowLeft className="size-4" aria-hidden /> Back to search
        </Link>
      </div>
      <Profile data={data} operator={viewer.role === 'operator'} />
    </main>
  )
}
