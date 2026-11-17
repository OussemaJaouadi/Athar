// Adapted from smoothui ai-loader (https://smoothui.dev/docs/components/ai-loader): the grid variant only, Athar tokens.
import { motion, useReducedMotion } from 'motion/react'

import { cn } from '@/lib/utils'

const CYCLE = 1.2
/** Diagonal wave order, so the grid fills like a sweep rather than at random. */
const DELAYS = [0, 1, 2, 1, 2, 3, 2, 3, 4]
const EASE = [0.645, 0.045, 0.355, 1] as const

/** A waiting indicator that never fakes progress: a 3×3 grid sweeping on one cycle, with a plain label. */
export function AILoader({ label, className }: { label: string; className?: string }) {
  const reduced = Boolean(useReducedMotion())
  return (
    <span role="status" aria-live="polite" className={cn('inline-flex items-center gap-2.5 text-[0.9375rem] text-ink', className)}>
      <span aria-hidden className="grid grid-cols-3 gap-[3px] text-glaze">
        {DELAYS.map((d, i) => (
          <motion.span
            key={i}
            className="size-[5px] rounded-[1px] bg-current"
            animate={reduced ? { opacity: 0.6 } : { opacity: [0.2, 1, 0.2] }}
            transition={reduced ? { duration: 0 } : { delay: (d * CYCLE) / 8, duration: CYCLE, ease: EASE, repeat: Number.POSITIVE_INFINITY }}
          />
        ))}
      </span>
      {label}
    </span>
  )
}
