import { createServerFn, createServerOnlyFn } from '@tanstack/react-start'
import { getCookie, getRequestHeader, getRequestUrl, setCookie } from '@tanstack/react-start/server'

export type Role = 'operator' | 'user'
const COOKIE = 'athar_role'

/**
 * Becoming operator. With ATHAR_OPERATOR_PASSPHRASE set, the cookie holds a token derived from it, so it cannot be
 * forged and changing the passphrase signs everyone out. Without it (one person on their own machine) the visitor
 * picks the role on the sign-in page and the cookie holds the word `operator`.
 */
export function operatorToken(passphrase: string): string {
  return new Bun.CryptoHasher('sha256').update(`athar-operator:${passphrase}`).digest('hex')
}

// Compared in constant time, without a Node module: this file is also loaded in the browser for its server functions.
function sameText(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

export function isOperatorCookie(cookie: string | undefined, passphrase: string | undefined): boolean {
  if (!passphrase) return cookie === 'operator'
  if (!cookie) return false
  return sameText(cookie, operatorToken(passphrase))
}

const passphraseFromEnv = () => process.env.ATHAR_OPERATOR_PASSPHRASE || undefined

/** Throws unless the visitor holds the operator cookie. The first line of every operator-only server function. */
export const requireOperator = createServerOnlyFn((): void => {
  if (!isOperatorCookie(getCookie(COOKIE), passphraseFromEnv())) throw new Error('Operator access is required')
})

export const getViewer = createServerFn().handler(async () => {
  const passphrase = passphraseFromEnv()
  const role: Role = isOperatorCookie(getCookie(COOKIE), passphrase) ? 'operator' : 'user'
  return { role, passphraseSet: Boolean(passphrase) }
})

export type SignInResult = { ok: true; role: Role } | { ok: false; error: string }

const WRONG = 'That passphrase is not the one set on this install.'

export const signIn = createServerFn({ method: 'POST' })
  .validator((input: unknown): { role: Role; passphrase?: string } => {
    if (typeof input === 'string') return { role: input === 'operator' ? 'operator' : 'user' }
    const raw = (input ?? {}) as { role?: unknown; passphrase?: unknown }
    return { role: raw.role === 'operator' ? 'operator' : 'user', passphrase: typeof raw.passphrase === 'string' ? raw.passphrase : undefined }
  })
  .handler(async ({ data }): Promise<SignInResult> => {
    const passphrase = passphraseFromEnv()
    let value: string = data.role
    if (data.role === 'operator' && passphrase) {
      if (!sameText(operatorToken(data.passphrase ?? ''), operatorToken(passphrase))) {
        await new Promise((resolve) => setTimeout(resolve, 400))
        return { ok: false, error: WRONG }
      }
      value = operatorToken(passphrase)
    }
    const secure = getRequestUrl().protocol === 'https:' || getRequestHeader('x-forwarded-proto') === 'https'
    setCookie(COOKIE, value, { httpOnly: true, sameSite: 'lax', path: '/', secure })
    return { ok: true, role: data.role }
  })
