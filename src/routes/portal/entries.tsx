import { createFileRoute, redirect } from '@tanstack/react-router'

type SearchParams = { q?: string; entry?: string; startup?: string }

// Entries is now part of Startups: an entry is evidence inside the startup it belongs to. Old links keep working.
export const Route = createFileRoute('/portal/entries')({
  validateSearch: (s: Record<string, unknown>): SearchParams => ({
    q: typeof s.q === 'string' && s.q.trim() ? s.q : undefined,
    entry: typeof s.entry === 'string' && s.entry ? s.entry : undefined,
    startup: typeof s.startup === 'string' && s.startup ? s.startup : undefined,
  }),
  beforeLoad: ({ search }) => {
    throw redirect({ to: '/portal/startups', search: { q: search.q, startup: search.startup, entry: search.entry } })
  },
})
