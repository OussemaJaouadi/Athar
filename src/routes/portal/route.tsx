import { Link, Outlet, createFileRoute, redirect } from '@tanstack/react-router'

import { getViewer } from '#/server/auth'

// Operator portal shell: operations, data and debugging. Compact density.
export const Route = createFileRoute('/portal')({
  beforeLoad: async () => {
    const viewer = await getViewer()
    if (viewer.role !== 'operator') throw redirect({ to: '/sign-in' })
  },
  component: PortalShell,
})

function PortalShell() {
  return (
    <div className="portal">
      <header className="shell-header">
        <Link to="/portal/runs" className="brand">
          <img src="/athar.svg" alt="" width={24} height={24} />
          Athar operator
        </Link>
        <nav aria-label="Portal">
          <Link to="/portal/runs">Runs</Link>
          <Link to="/portal/database">Database</Link>
          <Link to="/portal/keys">Keys</Link>
        </nav>
        <span className="spacer" />
        <Link to="/search">Main app</Link>
      </header>
      <Outlet />
    </div>
  )
}
