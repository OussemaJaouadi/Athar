import { createFileRoute, redirect } from '@tanstack/react-router'

// Changes is now part of Status: a download is what Collect produces, so what it changed opens inside that step.
// Old links keep working.
export const Route = createFileRoute('/portal/changes')({
  validateSearch: (s: Record<string, unknown>): { download?: number } => {
    const d = Number(s.download)
    return { download: Number.isInteger(d) && d > 0 ? d : undefined }
  },
  beforeLoad: ({ search }) => {
    throw redirect({ to: '/portal', search: { step: 'collect', download: search.download } })
  },
})
