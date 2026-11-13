import { HeadContent, Link, Scripts, createRootRoute } from '@tanstack/react-router'

import appCss from '../styles.css?url'

const FONTS =
  'https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500&family=IBM+Plex+Sans:wght@400;500&family=Readex+Pro:wght@500;600&display=swap'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Athar' },
    ],
    links: [
      { rel: 'icon', href: '/athar.svg', type: 'image/svg+xml' },
      { rel: 'stylesheet', href: FONTS },
      { rel: 'stylesheet', href: appCss },
    ],
  }),
  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <header style={{ display: 'flex', gap: '1.5rem', alignItems: 'center', padding: '1rem 1.5rem' }}>
          <img src="/athar.svg" alt="" width={32} height={32} />
          <strong style={{ fontFamily: 'var(--font-display)' }}>Athar</strong>
          <nav style={{ display: 'flex', gap: '1rem' }}>
            <Link to="/">App</Link>
            <Link to="/portal">Operator portal</Link>
          </nav>
        </header>
        {children}
        <Scripts />
      </body>
    </html>
  )
}
