import { createFileRoute, redirect } from '@tanstack/react-router'

// Quality is now part of Startups: a fact is a filter over startups. Old links keep working.
export const Route = createFileRoute('/portal/quality')({
  validateSearch: (q: Record<string, unknown>): { fact?: string } => ({
    fact: typeof q.fact === 'string' && q.fact ? q.fact : undefined,
  }),
  beforeLoad: ({ search }) => {
    throw redirect({ to: '/portal/startups', search: { fact: search.fact } })
  },
})
