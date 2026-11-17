import { Moon, Sun } from 'lucide-react'
import { useEffect, useState } from 'react'

import { cn } from '@/lib/utils'

const KEY = 'athar-theme'

/** Runs before paint: an explicit choice wins, otherwise the system decides. */
export const themeScript = `(function(){try{var t=localStorage.getItem('${KEY}');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}})()`

function current(): 'light' | 'dark' {
  const set = document.documentElement.dataset.theme
  if (set === 'light' || set === 'dark') return set
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function ThemeToggle({ className }: { className?: string }) {
  const [theme, setTheme] = useState<'light' | 'dark' | null>(null)
  useEffect(() => setTheme(current()), [])
  const next = theme === 'dark' ? 'light' : 'dark'
  return (
    <button
      type="button"
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
      onClick={() => {
        document.documentElement.dataset.theme = next
        try {
          localStorage.setItem(KEY, next)
        } catch {}
        setTheme(next)
      }}
      className={cn('grid size-11 place-content-center rounded-[4px] border border-edge text-ink hover:bg-surface sm:size-9', className)}
    >
      {theme === 'dark' ? <Sun className="size-4" aria-hidden /> : <Moon className="size-4" aria-hidden />}
    </button>
  )
}

export type ThemeChoice = 'light' | 'dark' | 'system'

/** The stored choice: an explicit light or dark, or the system's. */
export function readThemeChoice(): ThemeChoice {
  if (typeof document === 'undefined') return 'system'
  const set = document.documentElement.dataset.theme
  return set === 'light' || set === 'dark' ? set : 'system'
}

/** Apply and remember a theme choice; "system" hands the decision back to the OS. */
export function applyThemeChoice(choice: ThemeChoice) {
  const root = document.documentElement
  if (choice === 'system') delete root.dataset.theme
  else root.dataset.theme = choice
  try {
    if (choice === 'system') localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, choice)
  } catch {}
}
