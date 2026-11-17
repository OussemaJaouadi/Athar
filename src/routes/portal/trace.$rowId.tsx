import { createFileRoute, redirect } from '@tanstack/react-router'

// Old trace links carried a source-row UUID, which pipeline v2 no longer has. A startup slug opens that startup;
// anything else lands on the Trace list.
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export const Route = createFileRoute('/portal/trace/$rowId')({
  beforeLoad: ({ params }) => {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(params.rowId)
    throw redirect({ to: '/portal/trace', search: !isUuid && SLUG.test(params.rowId) ? { startup: params.rowId } : {} })
  },
})
