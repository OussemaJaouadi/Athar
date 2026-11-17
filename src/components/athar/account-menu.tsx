import { useRouter } from '@tanstack/react-router'
import { LogIn, ShieldCheck } from 'lucide-react'
import { useEffect, useState } from 'react'

import { applyThemeChoice, readThemeChoice, type ThemeChoice } from '@/components/athar/theme'
import ProfileDropdown from '@/components/kokonutui/profile-dropdown'
import { signIn, type Role } from '#/server/auth'

/**
 * The header's one account control (kokonut ui Account Menu): who you are, the theme, and the way to the
 * operator portal. A guest sees Sign in; an operator sees the portal and can hold to sign out.
 */
export function AccountMenu({ role }: { role: Role }) {
  const router = useRouter()
  const [theme, setTheme] = useState<ThemeChoice>('system')
  useEffect(() => setTheme(readThemeChoice()), [])
  const operator = role === 'operator'

  return (
    <ProfileDropdown
      accounts={[
        operator
          ? { id: 'operator', name: 'Operator', email: 'Signed in', initials: 'OP', plan: 'Operator' }
          : { id: 'guest', name: 'Guest', email: 'Reading the archive', initials: 'G' },
      ]}
      showStatus={false}
      compact
      theme={theme}
      onThemeChange={(next) => {
        applyThemeChoice(next)
        setTheme(next)
      }}
      items={
        operator
          ? [{ label: 'Operator portal', icon: <ShieldCheck className="size-4" aria-hidden />, href: '/portal' }]
          : [{ label: 'Sign in as operator', icon: <LogIn className="size-4" aria-hidden />, href: '/sign-in' }]
      }
      onSignOut={
        operator
          ? async () => {
              await signIn({ data: 'user' })
              await router.invalidate()
            }
          : undefined
      }
    />
  )
}
