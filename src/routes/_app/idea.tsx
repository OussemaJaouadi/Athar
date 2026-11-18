import { createFileRoute, redirect } from '@tanstack/react-router'

// Asking an idea lives on the home page; old links to /idea land there with their text.
export const Route = createFileRoute('/_app/idea')({
  validateSearch: (s: Record<string, unknown>): { q?: string } => ({
    q: typeof s.q === 'string' ? s.q : typeof s.draft === 'string' ? s.draft : undefined,
  }),
  beforeLoad: ({ search }) => {
    throw redirect({ to: '/', search: { q: search.q } })
  },
})
