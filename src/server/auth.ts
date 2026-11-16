import { createServerFn } from '@tanstack/react-start'
import { getCookie, setCookie } from '@tanstack/react-start/server'

export type Role = 'operator' | 'user'
const COOKIE = 'athar_role'

// Placeholder sign-in: the visitor picks a role. How the first operator is created is still open.
export const getViewer = createServerFn().handler(async () => {
  const role: Role = getCookie(COOKIE) === 'operator' ? 'operator' : 'user'
  return { role }
})

export const signIn = createServerFn({ method: 'POST' })
  .validator((role: unknown): Role => (role === 'operator' ? 'operator' : 'user'))
  .handler(async ({ data }) => {
    setCookie(COOKIE, data, { httpOnly: true, sameSite: 'lax', path: '/' })
    return { role: data }
  })
