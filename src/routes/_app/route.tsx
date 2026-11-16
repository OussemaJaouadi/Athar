import { Link, Outlet, createFileRoute } from '@tanstack/react-router'

import { getViewer } from '#/server/auth'

// Main app shell: the business side — what was tried, by whom, and where nobody tried yet.
export const Route = createFileRoute('/_app')({
  loader: () => getViewer(),
  component: AppShell,
})

function AppShell() {
  const viewer = Route.useLoaderData()
  return (
    <>
      <header className="shell-header">
        <Link to="/search" className="brand">
          <img src="/athar.svg" alt="" width={28} height={28} />
          Athar
        </Link>
        <nav aria-label="Main">
          <Link to="/search">Search</Link>
          <Link to="/idea">Idea check</Link>
          <Link to="/themes">Themes</Link>
          <Link to="/landscape">Landscape</Link>
        </nav>
        <span className="spacer" />
        {viewer.role === 'operator' ? <Link to="/portal/runs">Operator portal</Link> : <Link to="/sign-in">Sign in</Link>}
      </header>
      <Outlet />
    </>
  )
}
