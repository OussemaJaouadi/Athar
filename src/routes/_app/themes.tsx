import { createFileRoute, redirect } from '@tanstack/react-router'

// Themes became Openings; old links keep working.
export const Route = createFileRoute('/_app/themes')({
  beforeLoad: () => {
    throw redirect({ to: '/openings' })
  },
})
