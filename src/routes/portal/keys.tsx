import { createFileRoute, useRouter } from '@tanstack/react-router'
import { CircleAlert, CircleCheck, Ellipsis, FlaskConical, KeyRound, MessageSquareText, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'

import { DeskBar, deskBtn, deskPrimary, deskTd, deskTh } from '@/components/athar/desk'
import { AddKeyForm, dialogSurface } from '@/components/athar/key-form'
import { KeyNote } from '@/components/athar/key-ui'
import { labTime } from '@/components/athar/lab'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { PROVIDER_NAME } from '#/shared/key-models'
import { isProvider } from '#/shared/providers'
import { deleteKey, listKeyRows, retestKey, type KeyRow } from '#/server/api/keys'
import { probeKey, type KeyProbe } from '#/server/api/ops'

export const Route = createFileRoute('/portal/keys')({
  loader: () => listKeyRows(),
  component: KeysPage,
})

const providerName = (p: string) => (isProvider(p) ? PROVIDER_NAME[p] : p)

// Keys: a settings page, not a desk. A compact table; "Add a key" opens a small dialog with one action.
function KeysPage() {
  const keys = Route.useLoaderData()
  const [adding, setAdding] = useState(false)
  const [fresh, setFresh] = useState<string>()
  const used = keys.some((k) => k.calls)

  return (
    <main className="flex min-h-0 flex-1 flex-col">
      <DeskBar
        title="Keys"
        facts="Used by Prepare and the idea sentences"
        actions={
          keys.length > 0 && (
            <button type="button" className={deskPrimary} onClick={() => setAdding(true)}>
              <Plus aria-hidden />
              Add a key
            </button>
          )
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 [scrollbar-width:thin] [scrollbar-color:var(--edge)_transparent]">
        {keys.length === 0 ? (
          <div className="mx-auto mt-[12vh] grid max-w-[420px] justify-items-center gap-3 text-center">
            <span className="grid size-10 place-items-center rounded-full bg-ok-bg text-ok">
              <KeyRound className="size-5" strokeWidth={1.5} aria-hidden />
            </span>
            <h2 className="font-display text-[1.375rem] leading-tight font-bold text-ink">No keys yet</h2>
            <p className="text-[0.875rem] text-ink">
              A key lets Prepare clean descriptions and lets an idea check explain what is the same and what differs. Meaning search runs on a local model and needs no key. Each key is tested with its provider before it is saved.
            </p>
            <button type="button" className={cn(deskPrimary, 'mt-1')} onClick={() => setAdding(true)}>
              <Plus aria-hidden />
              Add a key
            </button>
          </div>
        ) : (
          <table className="w-full tabular-nums">
            <thead>
              <tr>
                {['Name', 'Provider', 'Model', 'Key', 'Last tested', ...(used ? ['Used'] : [])].map((h) => (
                  <th key={h} scope="col" className={deskTh}>
                    {h}
                  </th>
                ))}
                <th scope="col" className={cn(deskTh, 'w-12')}>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {keys.map((k) => (
                <KeyRowView key={k.id} k={k} used={used} highlight={k.id === fresh} />
              ))}
            </tbody>
          </table>
        )}
      </div>
      <AddKeyForm open={adding} onOpenChange={setAdding} onSaved={setFresh} />
    </main>
  )
}

function KeyRowView({ k, used, highlight }: { k: KeyRow; used: boolean; highlight: boolean }) {
  const router = useRouter()
  const [testing, setTesting] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; message: string }>()
  const [confirm, setConfirm] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [removeError, setRemoveError] = useState<string>()
  const [asking, setAsking] = useState(false)
  const [probe, setProbe] = useState<KeyProbe>()
  const ok = result ? result.ok : k.last_test_ok === 1
  const tested = result || k.last_tested_at
  const Icon = ok ? CircleCheck : CircleAlert
  const message = result?.message ?? k.last_test_message ?? ''

  const retest = async () => {
    setTesting(true)
    try {
      setResult(await retestKey({ data: k.id }))
      await router.invalidate()
    } catch (e) {
      setResult({ ok: false, message: e instanceof Error ? e.message : String(e) })
    } finally {
      setTesting(false)
    }
  }

  // The save-time test only asks the provider whether it lists the model; this sends one real line and shows the answer.
  const ask = async () => {
    setAsking(true)
    setProbe(undefined)
    try {
      setProbe(await probeKey({ data: k.id }))
      await router.invalidate()
    } catch (e) {
      setProbe({ ok: false, error: e instanceof Error ? e.message : String(e), milliseconds: 0 })
    } finally {
      setAsking(false)
    }
  }
  const tokens = (p: Extract<KeyProbe, { ok: true }>) =>
    p.inputTokens === null && p.outputTokens === null ? '' : ` · ${p.inputTokens ?? '?'} tokens in, ${p.outputTokens ?? '?'} out`

  return (
    <>
      <tr className={cn(highlight && 'bg-surface')}>
        <td className={cn(deskTd, 'font-medium')}>{k.name}</td>
        <td className={deskTd}>{providerName(k.provider)}</td>
        <td className={deskTd}>{k.model}</td>
        <td className={cn(deskTd, 'font-mono text-[0.8125rem]')}>{k.hint}</td>
        <td className={deskTd}>
          {testing ? (
            'Testing…'
          ) : tested ? (
            <span className="inline-flex items-center gap-1.5" title={!ok && message ? message : undefined}>
              <Icon className={cn('size-4 shrink-0', ok ? 'text-ok' : 'text-bad')} aria-hidden />
              {ok ? 'Passed' : 'Failed'}
              <span className="text-ink-2">· {result ? 'just now' : labTime(k.last_tested_at!)}</span>
            </span>
          ) : (
            <span className="text-ink-2">Never tested</span>
          )}
        </td>
        {used && <td className={deskTd}>{k.calls ? `${k.calls.toLocaleString('en-GB')} calls · ${k.tokens.toLocaleString('en-GB')} tokens` : '—'}</td>}
        <td className={cn(deskTd, 'text-end')}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className={cn(deskBtn, 'w-8 justify-center border-transparent px-0 hover:border-edge')} aria-label={`Actions for ${k.name}`}>
                <Ellipsis aria-hidden />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-40 rounded-[6px] border border-edge bg-surface p-1 text-ink shadow-[0_12px_32px_-12px_rgb(0_0_0/0.45)] ring-0">
              <DropdownMenuItem onSelect={retest} className="min-h-8 rounded-[4px] px-2.5 text-[0.875rem] text-ink focus:bg-surface-raised focus:text-ink">
                <FlaskConical aria-hidden />
                Test again
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={ask} className="min-h-8 rounded-[4px] px-2.5 text-[0.875rem] text-ink focus:bg-surface-raised focus:text-ink">
                <MessageSquareText aria-hidden />
                Ask the model
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setConfirm(true)} className="min-h-8 rounded-[4px] px-2.5 text-[0.875rem] text-ink focus:bg-surface-raised focus:text-ink">
                <Trash2 aria-hidden />
                Remove…
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </td>
      </tr>
      {(asking || probe) && (
        <tr>
          <td colSpan={used ? 7 : 6} className="border-b border-hairline px-3 pb-2.5">
            {asking ? (
              <p className="text-[0.8125rem] text-ink-2">Asking {k.model}…</p>
            ) : probe?.ok ? (
              <KeyNote ok>
                <span>
                  The model answered in {(probe.milliseconds / 1000).toFixed(1)} s{tokens(probe)}:
                </span>{' '}
                <span dir="auto" className="italic">“{probe.reply}”</span>
              </KeyNote>
            ) : probe ? (
              <KeyNote ok={false}>
                No answer{probe.milliseconds ? ` after ${(probe.milliseconds / 1000).toFixed(1)} s` : ''}: {probe.error}
              </KeyNote>
            ) : null}
          </td>
        </tr>
      )}
      {!ok && tested && message && (
        <tr>
          <td colSpan={used ? 7 : 6} className="border-b border-hairline px-3 pb-2.5">
            <KeyNote ok={false}>The provider said: {message}</KeyNote>
          </td>
        </tr>
      )}
      <Dialog open={confirm} onOpenChange={(o) => (setConfirm(o), setRemoveError(undefined))}>
        <DialogContent className={cn(dialogSurface, 'sm:max-w-[420px]')} showCloseButton={false}>
          <div className="grid gap-1.5 px-5 pt-4 pb-3">
            <DialogTitle className="font-display text-[1.375rem] leading-tight font-bold text-ink">Remove {k.name}?</DialogTitle>
            <DialogDescription className="text-[0.875rem] text-ink">
              The key is deleted from the server. Its usage history stays. This cannot be undone.
            </DialogDescription>
            {removeError && <KeyNote ok={false}>Could not remove it: {removeError.replace(/[.\s]+$/, '')}.</KeyNote>}
          </div>
          <div className="flex justify-end gap-2 border-t border-hairline px-5 py-3">
            <button type="button" className={deskBtn} onClick={() => setConfirm(false)}>
              Cancel
            </button>
            <button
              type="button"
              disabled={removing}
              className={cn(deskBtn, 'border-ink font-medium')}
              onClick={async () => {
                setRemoving(true)
                setRemoveError(undefined)
                try {
                  await deleteKey({ data: k.id })
                  setConfirm(false)
                  await router.invalidate()
                } catch (e) {
                  setRemoveError(e instanceof Error ? e.message : String(e))
                } finally {
                  setRemoving(false)
                }
              }}
            >
              <Trash2 aria-hidden />
              {removing ? 'Removing…' : 'Remove key'}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
