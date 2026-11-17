import { createFileRoute, redirect } from '@tanstack/react-router'

// A row's trace opens in the drawer on the Trace page; old links land there.
export const Route = createFileRoute('/portal/trace/$rowId')({
  beforeLoad: ({ params }) => {
    throw redirect({ to: '/portal/trace', search: { row: params.rowId } })
  },
})
