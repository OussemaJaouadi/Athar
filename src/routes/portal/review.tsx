import { createFileRoute, redirect } from '@tanstack/react-router'

// Pipeline v2 has no review queue: every former finding is a fact on the startup or settled by a rule.
// Old links land on the Pipeline page.
export const Route = createFileRoute('/portal/review')({
  beforeLoad: () => {
    throw redirect({ to: '/portal' })
  },
})
