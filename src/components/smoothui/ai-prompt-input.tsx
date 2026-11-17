// Adapted from smoothui ai-prompt-input (https://smoothui.dev/docs/components/ai-prompt-input):
// no attachments, no smooth-button/ai-core; Athar tokens; a labelled submit instead of a bare arrow.
import { ArrowUp } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion, type Transition } from 'motion/react'
import { type ChangeEvent, type KeyboardEvent, type ReactNode, useCallback, useLayoutEffect, useRef, useState } from 'react'

import { cn } from '@/lib/utils'

const MAX_ROWS = 6
const SPRING: Transition = { bounce: 0.1, duration: 0.25, type: 'spring' }
const EASE_OUT = [0.23, 1, 0.32, 1] as const

export type AIPromptInputProps = {
  'aria-label': string
  className?: string
  /** Under the text, left of the submit: hints, counters. */
  children?: ReactNode
  busy?: boolean
  /** Shortest draft that can be sent. */
  minLength?: number
  onSubmit: (value: string) => void
  onValueChange: (value: string) => void
  placeholder?: string
  size?: 'lg' | 'md'
  submitLabel?: string
  value: string
}

/**
 * The prompt composer. Grows with the text on a layout spring, so a pasted paragraph settles instead of snapping.
 * Enter sends, Shift+Enter breaks the line.
 */
export function AIPromptInput({ 'aria-label': ariaLabel, className, children, busy = false, minLength = 1, onSubmit, onValueChange, placeholder, size = 'lg', submitLabel = 'Ask', value }: AIPromptInputProps) {
  const reduced = useReducedMotion()
  const ref = useRef<HTMLTextAreaElement | null>(null)
  const [focused, setFocused] = useState(false)
  const canSubmit = value.trim().length >= minLength && !busy

  const resize = useCallback(() => {
    const t = ref.current
    if (!t) return
    t.style.height = 'auto'
    const max = Number.parseFloat(getComputedStyle(t).lineHeight || '28') * MAX_ROWS
    t.style.height = `${Math.min(t.scrollHeight, max)}px`
    t.style.overflowY = t.scrollHeight > max ? 'auto' : 'hidden'
  }, [])
  useLayoutEffect(() => {
    if (value.length === 0 && ref.current) ref.current.style.height = ''
    resize()
  }, [value, resize])

  const submit = () => canSubmit && onSubmit(value.trim())

  return (
    <motion.div
      layout={reduced ? false : 'position'}
      transition={reduced ? { duration: 0 } : SPRING}
      className={cn(
        'relative w-full rounded-[1.25rem] border bg-surface transition-colors motion-reduce:transition-none',
        focused ? 'border-ink outline-2 outline-offset-2 outline-glaze outline' : 'border-edge',
        className,
      )}
    >
      <textarea
        ref={ref}
        dir="auto"
        rows={1}
        aria-label={ariaLabel}
        value={value}
        placeholder={placeholder}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={(e: ChangeEvent<HTMLTextAreaElement>) => onValueChange(e.target.value)}
        onKeyDown={(e: KeyboardEvent<HTMLTextAreaElement>) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            submit()
          }
        }}
        className={cn(
          'block w-full resize-none bg-transparent px-5 text-ink outline-none placeholder:text-ink-2',
          size === 'lg' ? 'pt-5 pb-2 text-lg leading-8 sm:text-xl' : 'pt-4 pb-1 text-base leading-7',
        )}
      />
      <div className="flex items-center justify-between gap-3 px-3 pb-3 ps-5">
        <div className="min-w-0 text-[0.8125rem] text-ink-2">{children}</div>
        <motion.button
          type="button"
          onClick={submit}
          disabled={!canSubmit}
          aria-label={busy ? 'Reading the registry' : submitLabel}
          whileHover={!canSubmit || reduced ? undefined : { scale: 1.03 }}
          whileTap={!canSubmit || reduced ? undefined : { scale: 0.96 }}
          transition={reduced ? { duration: 0 } : SPRING}
          className={cn(
            'inline-flex h-11 shrink-0 items-center gap-2 rounded-xl px-4 text-[0.9375rem] font-medium',
            canSubmit ? 'bg-ink text-canvas' : 'cursor-not-allowed border border-edge bg-transparent text-ink-2',
          )}
        >
          <span>{submitLabel}</span>
          <AnimatePresence initial={false} mode="popLayout">
            <motion.span
              key={busy ? 'busy' : 'send'}
              initial={reduced ? { opacity: 1 } : { opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={reduced ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, scale: 0.6 }}
              transition={reduced ? { duration: 0 } : { duration: 0.18, ease: EASE_OUT }}
              className="grid size-6 place-items-center"
            >
              <ArrowUp aria-hidden className="size-[18px]" />
            </motion.span>
          </AnimatePresence>
        </motion.button>
      </div>
    </motion.div>
  )
}
