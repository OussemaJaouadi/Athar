import { createFileRoute, redirect } from '@tanstack/react-router'

// A run lives in the Pipeline page's pane now; old run links land there with the run selected.
export const Route = createFileRoute('/portal/runs/$runId')({
  beforeLoad: ({ params }) => {
    throw redirect({ to: '/portal', search: { run: params.runId } })
  },
})
