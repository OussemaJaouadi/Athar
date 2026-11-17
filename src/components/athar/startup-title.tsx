import { ChevronDown } from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'

import { StartupLink } from '@/components/athar/startup-glimpse'
import { TileMark } from '@/components/athar/tile-mark'
import { useAccordion, useAutoHeight } from '@/components/interior/accordion'
import { cn } from '@/lib/utils'

/**
 * A startup's name in a list: its tile (sector glaze, its own pattern, the same one everywhere in Athar) and the link.
 * Every entity page lists startups through this, so a startup always looks like itself.
 */
export function StartupTitle({ id, name, sector, className }: { id: string; name: string; sector: string | null; className?: string }) {
  return (
    <span className={cn('flex min-w-0 items-start gap-3', className)}>
      <TileMark id={id} sector={sector} size={28} className="mt-0.5 shrink-0" />
      <StartupLink id={id} className="font-display text-xl leading-snug font-bold text-ink">
        <span dir="auto">{name}</span>
      </StartupLink>
    </span>
  )
}

/**
 * A closed list that opens in place: Interior's accordion logic (keyboard, ARIA, height measured, never a jump),
 * drawn in Athar's terms: an edge rule above, the summary as plain text with a chevron, no card.
 */
export function Disclosure({ summary, defaultOpen = false, children }: { summary: React.ReactNode; defaultOpen?: boolean; children: React.ReactNode }) {
  const reduced = useReducedMotion()
  const { isOpen, headerProps, panelProps } = useAccordion({ items: [{ id: 'd' }], defaultOpen: defaultOpen ? ['d'] : [] })
  const { ref, height, ready } = useAutoHeight()
  const open = isOpen('d')
  return (
    <div className="border-t border-edge">
      <button {...headerProps('d')} className="flex w-full items-center justify-between gap-4 py-3 text-start text-base text-ink">
        <span>{summary}</span>
        <ChevronDown aria-hidden className={cn('size-4 shrink-0 text-ink-2 transition-transform duration-200 motion-reduce:transition-none', open && 'rotate-180')} />
      </button>
      <motion.div
        {...panelProps('d')}
        initial={false}
        animate={{ height: open ? (ready ? height : 'auto') : 0 }}
        transition={reduced ? { duration: 0 } : { type: 'spring', stiffness: 380, damping: 40 }}
        className="overflow-hidden"
        inert={!open}
      >
        <div ref={ref}>{children}</div>
      </motion.div>
    </div>
  )
}
