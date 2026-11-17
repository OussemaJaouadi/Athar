import { createFileRoute, useRouter } from '@tanstack/react-router'
import { CircleAlert, CircleCheck, LoaderCircle, RefreshCw } from 'lucide-react'
import { useState } from 'react'

import { KeyForm } from '@/components/athar/key-form'
import { HoldToRemove, KeyNote } from '@/components/athar/key-ui'
import { labTime } from '@/components/athar/lab'
import { OpsHeading, OpsPage, opsGhost, opsRow, opsTd, opsTh } from '@/components/athar/ops'
import { cn } from '@/lib/utils'
import { PROVIDER_NAME } from '#/shared/key-models'
import { isProvider } from '#/shared/providers'
import { deleteKey, listKeyRows, retestKey, type KeyRow } from '#/server/api/keys'

export const Route = createFileRoute('/portal/keys')({
  loader: () => listKeyRows(),
  component: KeysPage,
})

const providerName = (p: string) => (isProvider(p) ? PROVIDER_NAME[p] : p)

function KeysPage() {
  const keys = Route.useLoaderData()
  return (
    <OpsPage
      title="Keys"
      lede="No part of Athar uses a key yet. Keys added here are ready for when description cleaning and similarity search are built."
    >
      <KeyForm />
      <section aria-labelledby="saved-h" className="grid min-w-0 gap-2">
        <OpsHeading id="saved-h">Saved keys</OpsHeading>
        {keys.length === 0 ? <p className="text-[0.8125rem] text-ink">No keys yet.</p> : <KeyTable keys={keys} />}
      </section>
    </OpsPage>
  )
}

function KeyTable({ keys }: { keys: KeyRow[] }) {
  const used = keys.some((k) => k.calls > 0)
  return (
    <div className="overflow-x-auto rounded-md border border-edge">
      <table className="w-full">
        <thead className="bg-surface">
          <tr>
            {['Name', 'Provider', 'Model', 'Key', 'Last tested', ...(used ? ['Used'] : []), ''].map((h, i) => (
              <th key={h || i} scope="col" className={opsTh}>
                {h || <span className="sr-only">Remove</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {keys.map((k) => (
            <KeyRowView key={k.id} k={k} used={used} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function KeyRowView({ k, used }: { k: KeyRow; used: boolean }) {
  const router = useRouter()
  const [testing, setTesting] = useState(false)
  const [fresh, setFresh] = useState<{ ok: boolean; message: string }>()
  const [removeError, setRemoveError] = useState<string>()
  const result = fresh ?? (k.last_tested_at ? { ok: k.last_test_ok === 1, message: k.last_test_message ?? '' } : undefined)
  const Icon = result?.ok ? CircleCheck : CircleAlert

  return (
    <tr className={cn(opsRow, 'align-top')}>
      <td className={cn(opsTd, 'font-medium whitespace-nowrap')}>{k.name}</td>
      <td className={cn(opsTd, 'whitespace-nowrap')}>{providerName(k.provider)}</td>
      <td className={cn(opsTd, 'font-mono wrap-anywhere')}>{k.model}</td>
      <td className={cn(opsTd, 'font-mono whitespace-nowrap')}>{k.hint}</td>
      <td className={cn(opsTd, 'min-w-64')}>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {result ? (
            <span className="inline-flex items-center gap-1.5" title={result.ok ? undefined : result.message}>
              <Icon className="size-3.5 shrink-0" aria-hidden />
              <span className="sr-only">{result.ok ? 'Passed' : 'Failed'}, </span>
              {k.last_tested_at && !fresh ? labTime(k.last_tested_at) : 'Just now'}
            </span>
          ) : (
            <span>Never tested</span>
          )}
          <button
            type="button"
            disabled={testing}
            className={cn(opsGhost, 'h-7 px-1.5 disabled:cursor-wait')}
            onClick={async () => {
              setTesting(true)
              try {
                setFresh(await retestKey({ data: k.id }))
                await router.invalidate()
              } catch (e) {
                setFresh({ ok: false, message: e instanceof Error ? e.message : String(e) })
              } finally {
                setTesting(false)
              }
            }}
          >
            {testing ? <LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden /> : <RefreshCw aria-hidden />}
            {testing ? 'Testing…' : 'Test again'}
          </button>
        </div>
        {result && !result.ok && <p className="mt-1 text-ink">{result.message}</p>}
      </td>
      {used && (
        <td className={cn(opsTd, 'whitespace-nowrap tabular-nums')}>
          {k.calls ? `${k.calls.toLocaleString('en-GB')} calls · ${k.tokens.toLocaleString('en-GB')} tokens` : 'Not used'}
        </td>
      )}
      <td className={cn(opsTd, 'py-1.5')}>
        <div className="grid justify-items-end gap-1.5">
          <HoldToRemove
            label={k.name}
            onConfirm={async () => {
              setRemoveError(undefined)
              try {
                await deleteKey({ data: k.id })
                await router.invalidate()
              } catch (e) {
                setRemoveError(e instanceof Error ? e.message : String(e))
              }
            }}
          />
          {removeError && <KeyNote ok={false}>Could not remove: {removeError.replace(/[.\s]+$/, '')}.</KeyNote>}
        </div>
      </td>
    </tr>
  )
}
