import { createFileRoute, redirect } from '@tanstack/react-router'

// Runs live on the Pipeline page now.
export const Route = createFileRoute('/portal/runs/')({
  beforeLoad: () => {
    throw redirect({ to: '/portal' })
  },
})
