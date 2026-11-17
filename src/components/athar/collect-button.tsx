import { useNavigate } from '@tanstack/react-router'
import { ChevronDown, LoaderCircle, Play, RefreshCw } from 'lucide-react'
import { useState } from 'react'

import { useLabToaster } from '@/components/athar/lab'
import { deskBtn, deskPrimary } from '@/components/athar/desk'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { startOperation } from '#/server/api/portal'

/** The pipeline's one action. Starts Collect, then opens the run so the operator can follow it. */
export function CollectButton({ running, again, className }: { running: boolean; again: boolean; className?: string }) {
  const navigate = useNavigate()
  const toaster = useLabToaster()
  const [starting, setStarting] = useState(false)
  const busy = starting || running
  return (
    <button
      type="button"
      className={cn(deskPrimary, className)}
      disabled={busy}
      onClick={() => {
        setStarting(true)
        toaster.show(
          async () => {
            try {
              const { runId } = await startOperation({ data: 'collect' })
              await navigate({ to: '/portal', search: { run: runId } })
            } finally {
              setStarting(false)
            }
          },
          {
            loading: 'Starting Collect',
            success: ['Collect started', 'It is selected in the list; its steps update as they run.'],
            error: (error) => [
              `Collect could not start: ${error instanceof Error ? error.message.replace(/[.\s]+$/, '') : String(error)}.`,
              'The stored registry is unchanged.',
            ],
          },
        )
      }}
    >
      {busy ? (
        <LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden />
      ) : (
        <RefreshCw aria-hidden />
      )}
      {busy ? 'Collecting…' : again ? 'Collect again' : 'Collect the registry'}
    </button>
  )
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString('en-GB')} ${n === 1 ? one : many}`

export const shortId = (id: string) => id.slice(-4)

export function duration(start: string | null, end: string | null) {
  if (!start || !end) return null
  const ms = Date.parse(end) - Date.parse(start)
  if (ms < 1000) return `${Math.max(0.1, ms / 1000).toFixed(1)} s`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`
  return `${Math.floor(ms / 60_000)} min ${Math.round((ms % 60_000) / 1000)} s`
}

type Operation = { id: string; label: string; description: string }

/**
 * The other operations, next to Collect: Rebuild, Check websites, Prepare, Embed. One menu, each with its own line on
 * what it does; Prepare says it needs a key when none is active. Starting one selects its run.
 */
export function RunMenu({ operations, running, hasKey }: { operations: Operation[]; running: boolean; hasKey: boolean }) {
  const navigate = useNavigate()
  const toaster = useLabToaster()
  const [starting, setStarting] = useState<string | null>(null)
  const others = operations.filter((o) => o.id !== 'collect')
  const start = (o: Operation) => {
    setStarting(o.id)
    toaster.show(
      async () => {
        try {
          const { runId } = await startOperation({ data: o.id })
          await navigate({ to: '/portal', search: { run: runId } })
        } finally {
          setStarting(null)
        }
      },
      {
        loading: `Starting ${o.label}`,
        success: [`${o.label} started`, 'It is selected in the list; its steps update as they run.'],
        error: (error) => [`${o.label} could not start: ${error instanceof Error ? error.message.replace(/[.\s]+$/, '') : String(error)}.`, 'Nothing was changed.'],
      },
    )
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className={deskBtn} disabled={running || starting !== null}>
          {starting ? <LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden /> : <Play aria-hidden />}
          Run
          <ChevronDown aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 rounded-[6px] border border-edge bg-surface p-1 text-ink shadow-[0_12px_32px_-12px_rgb(0_0_0/0.45)] ring-0">
        {others.map((o) => {
          const blocked = o.id === 'prepare' && !hasKey
          return (
            <DropdownMenuItem
              key={o.id}
              disabled={blocked}
              onSelect={() => start(o)}
              className="grid gap-0.5 rounded-[4px] px-2.5 py-2 text-ink focus:bg-surface-raised focus:text-ink data-disabled:opacity-100"
            >
              <span className={cn('text-[0.875rem] font-medium', blocked && 'text-ink-2')}>{o.label}</span>
              <span className="text-[0.8125rem] text-ink-2">{blocked ? 'Needs an AI key: add one under Keys.' : o.description}</span>
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
