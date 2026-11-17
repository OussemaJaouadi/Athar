import { createFileRoute, redirect } from '@tanstack/react-router'

// Old trace links carried a source-row UUID or a startup slug. A slug opens that startup's lead entry; anything else
// lands on the Entries search.
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export const Route = createFileRoute('/portal/trace/$rowId')({
  beforeLoad: ({ params }) => {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(params.rowId)
    throw redirect({ to: '/portal/startups', search: !isUuid && SLUG.test(params.rowId) ? { startup: params.rowId } : {} })
  },
})
