import { Check, Copy, X } from 'lucide-react'

import { useCopyToClipboard } from '@/components/interior/copy-button'
import { cn } from '@/lib/utils'

/** Interior's copy behaviour (clipboard fallback, timed reset) in Athar's skin: an icon button that says what it copies. */
export function DbCopy({ value, label, className }: { value: string; label: string; className?: string }) {
  const { copy, status } = useCopyToClipboard()
  const Icon = status === 'copied' ? Check : status === 'error' ? X : Copy
  return (
    <button
      type="button"
      onClick={() => void copy(value)}
      aria-label={status === 'copied' ? `${label}: copied` : label}
      title={label}
      className={cn('inline-grid size-8 shrink-0 place-items-center rounded-md border border-edge text-ink hover:bg-surface-raised', className)}
    >
      <Icon className="size-4" aria-hidden />
      <span className="sr-only" aria-live="polite">
        {status === 'copied' ? 'Copied' : status === 'error' ? 'Copy failed' : ''}
      </span>
    </button>
  )
}
