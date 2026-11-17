import { CircleAlert, CircleCheck } from 'lucide-react'

import { cn } from '@/lib/utils'

/** A test or save result in ink, with an icon and an edge bar: never colour alone. */
export function KeyNote({ ok, children, className }: { ok: boolean; children: React.ReactNode; className?: string }) {
  const Icon = ok ? CircleCheck : CircleAlert
  return (
    <div
      role={ok ? 'status' : 'alert'}
      className={cn('flex items-start gap-2 border-s-2 ps-2.5 text-[0.8125rem] leading-5 text-ink', ok ? 'border-s-glaze' : 'border-s-destructive', className)}
    >
      <Icon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      <div className="min-w-0">{children}</div>
    </div>
  )
}
