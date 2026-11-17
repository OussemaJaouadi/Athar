import { CircleAlert, CircleCheck } from 'lucide-react'

import { cn } from '@/lib/utils'

/** A test or save result: a tinted note with a coloured icon; the words stay ink, so it never reads by colour alone. */
export function KeyNote({ ok, children, className }: { ok: boolean; children: React.ReactNode; className?: string }) {
  const Icon = ok ? CircleCheck : CircleAlert
  return (
    <div role={ok ? 'status' : 'alert'} className={cn('flex items-start gap-2 rounded-[6px] px-2.5 py-2 text-[0.8125rem] leading-5 text-ink', ok ? 'bg-ok-bg' : 'bg-bad-bg', className)}>
      <Icon className={cn('mt-0.5 size-4 shrink-0', ok ? 'text-ok' : 'text-bad')} aria-hidden />
      <div className="min-w-0">{children}</div>
    </div>
  )
}
