import { createFileRoute, redirect } from '@tanstack/react-router'

// Trace became Entries: one entry from the registry to the vector. Old links keep their startup or query.
export const Route = createFileRoute('/portal/trace/')({
  beforeLoad: ({ search }) => {
    const s = search as Record<string, unknown>
    throw redirect({
      to: '/portal/entries',
      search: {
        startup: typeof s.startup === 'string' && s.startup ? s.startup : undefined,
        q: typeof s.q === 'string' && s.q ? s.q : undefined,
      },
    })
  },
})
