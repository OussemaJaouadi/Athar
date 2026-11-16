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
      className={cn('grid size-9 place-content-center rounded-[4px] border border-control text-ink-2 hover:bg-surface hover:text-ink', className)}
    >
      {theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </button>
  )
}
