import { createFileRoute, redirect } from '@tanstack/react-router'

// Themes was cut; old links land on Landscape.
export const Route = createFileRoute('/_app/themes')({
  beforeLoad: () => {
    throw redirect({ to: '/landscape' })
  },
})
