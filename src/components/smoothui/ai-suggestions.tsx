// Adapted from smoothui ai-suggestions (https://smoothui.dev/docs/components/ai-suggestions): Athar tokens, plain buttons.
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'

import { cn } from '@/lib/utils'

const SPRING = { bounce: 0.1, duration: 0.25, type: 'spring' as const }
const STAGGER = 0.045

/** Prompt chips of equal weight: they arrive from the centre of the row outwards, not left to right. */
export function AISuggestions({ suggestions, onSelect, label, className }: { suggestions: string[]; onSelect: (s: string) => void; label?: string; className?: string }) {
  const reduced = useReducedMotion()
  const middle = (suggestions.length - 1) / 2
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {label && <p className="text-[0.8125rem] text-ink-2">{label}</p>}
      <ul className="flex list-none flex-wrap gap-2">
        <AnimatePresence initial>
          {suggestions.map((s, i) => (
            <motion.li
              key={s}
              initial={reduced ? { opacity: 1 } : { opacity: 0, scale: 0.94, y: 6 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={reduced ? { duration: 0 } : { ...SPRING, delay: Math.abs(i - middle) * STAGGER }}
            >
              <button
                type="button"
                dir="auto"
                onClick={() => onSelect(s)}
                className="min-h-9 rounded-full border border-edge px-3.5 py-1.5 text-[0.9375rem] text-ink transition-colors hover:border-ink hover:bg-surface motion-reduce:transition-none"
              >
                {s}
              </button>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </div>
  )
}
