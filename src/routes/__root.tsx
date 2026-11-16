import { HeadContent, Link, Scripts, createRootRoute } from '@tanstack/react-router'

import { SiteHeader } from '@/components/athar/site-header'
import { themeScript } from '@/components/athar/theme'

import appCss from '../styles.css?url'

const FONTS =
  'https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&family=Readex+Pro:wght@300;400;500;600&family=Fragment+Mono&family=Noto+Naskh+Arabic:wght@400;500&display=swap'

export const Route = createRootRoute({
  head: () => ({
    meta: [{ charSet: 'utf-8' }, { name: 'viewport', content: 'width=device-width, initial-scale=1' }, { title: 'Athar' }],
    links: [
      { rel: 'icon', href: '/athar.svg', type: 'image/svg+xml' },
      { rel: 'stylesheet', href: FONTS },
      { rel: 'stylesheet', href: appCss },
    ],
  }),
  shellComponent: RootDocument,
  notFoundComponent: NotFound,
})

// A wrong address, said in the archive's voice.
function NotFound() {
  return (
    <>
    <SiteHeader>
      <Link to="/sign-in" className="text-sm whitespace-nowrap text-ink-2 no-underline hover:text-ink">
        Sign in
      </Link>
    </SiteHeader>
    <main className="mx-auto grid min-h-[60dvh] w-full max-w-[44rem] content-center gap-4 px-4 py-16 sm:px-8">
      <p className="flex gap-[3px]" aria-hidden>
        {Array.from({ length: 6 }, (_, i) => (
          <span key={i} className={i === 3 ? 'size-3 outline outline-1 -outline-offset-1 outline-dashed outline-tile-gap' : 'size-3 bg-tile-3'} />
        ))}
      </p>
      <h1 className="text-[1.75rem] leading-9">No record at this address.</h1>
      <p className="text-ink-2">The link may be old, or the startup may have left the registry in a later snapshot.</p>
      <p>
        <Link to="/search">Search the registry</Link>
      </p>
    </main>
    </>
  )
}

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  )
}
