import { createFileRoute, useRouter } from '@tanstack/react-router'
import { KeyRound, LoaderCircle, RefreshCw } from 'lucide-react'
import { useState } from 'react'

import { KeyForm } from '@/components/athar/key-form'
import { HoldToRemove, KeyNote } from '@/components/athar/key-ui'
import { labTime } from '@/components/athar/lab'
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
  const first = keys.length === 0
  return (
    <main className="grid gap-10 p-4 lg:p-8">
      <header className="grid max-w-[64rem] gap-3">
        <h1 className="font-display text-[1.75rem] leading-9">Keys</h1>
        <p className="font-display text-[1.625rem] leading-10 text-ink">
          No part of Athar uses a key yet. Keys added here are ready for when description cleaning and similarity search are built.
        </p>
      </header>

      {first ? (
        <section aria-labelledby="add-h" className="grid max-w-[56rem] gap-5 rounded-lg border border-edge bg-surface p-6">
          <div className="grid gap-1">
            <h2 id="add-h" className="inline-flex items-center gap-2 font-sans text-[1.0625rem] font-medium text-ink">
              <KeyRound className="size-5" strokeWidth={1.5} aria-hidden />
              Add the first key
            </h2>
            <p className="text-[0.9375rem] text-ink">Athar tests the key with the provider before saving it. The test lists models and spends no tokens.</p>
          </div>
          <KeyForm first />
        </section>
      ) : (
        <div className="grid items-start gap-10 xl:grid-cols-[minmax(0,1fr)_28rem]">
          <section aria-labelledby="saved-h" className="grid min-w-0 gap-3">
            <h2 id="saved-h" className="font-sans text-[0.9375rem] font-medium text-ink">
              Saved keys
            </h2>
            <KeyTable keys={keys} />
          </section>
          <section aria-labelledby="add-h" className="grid gap-4 rounded-lg border border-edge bg-surface p-5">
            <div className="grid gap-1">
              <h2 id="add-h" className="font-sans text-[0.9375rem] font-medium text-ink">
                Add a key
              </h2>
              <p className="text-[0.875rem] text-ink">Tested with the provider before it is saved. The test spends no tokens.</p>
            </div>
            <KeyForm first={false} />
          </section>
        </div>
      )}
    </main>
  )
}

function KeyTable({ keys }: { keys: KeyRow[] }) {
  const used = keys.some((k) => k.calls > 0)
  return (
    <div className="overflow-x-auto rounded-lg border border-edge">
      <table className="w-full text-[0.875rem]">
        <thead className="bg-surface text-[0.8125rem] text-ink-2">
          <tr>
            {['Name', 'Provider', 'Model', 'Key', 'Last tested', ...(used ? ['Used'] : []), ''].map((h, i) => (
              <th key={h || i} scope="col" className="px-4 py-3 text-start font-medium whitespace-nowrap">
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

  return (
    <tr className="border-t border-hairline align-top">
      <td className="px-4 py-3 font-medium whitespace-nowrap text-ink">{k.name}</td>
      <td className="px-4 py-3 whitespace-nowrap text-ink">{providerName(k.provider)}</td>
      <td className="px-4 py-3 font-mono text-[0.8125rem] wrap-anywhere text-ink">{k.model}</td>
      <td className="px-4 py-3 font-mono text-[0.8125rem] whitespace-nowrap text-ink">{k.hint}</td>
      <td className="min-w-72 px-4 py-3">
        <div className="grid gap-2">
          {result ? (
            <KeyNote ok={result.ok}>
              <p>{k.last_tested_at && !fresh ? labTime(k.last_tested_at) : 'Just now'}</p>
              {!result.ok && <p>{result.message}</p>}
            </KeyNote>
          ) : (
            <p className="text-ink">Never tested</p>
          )}
          <button
            type="button"
            disabled={testing}
            className="inline-flex h-8 w-fit items-center gap-1.5 rounded-md border border-edge px-2.5 text-[0.8125rem] font-medium text-ink hover:border-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-glaze disabled:cursor-wait"
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
            {testing ? <LoaderCircle className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden /> : <RefreshCw className="size-3.5" aria-hidden />}
            {testing ? 'Testing…' : 'Test again'}
          </button>
        </div>
      </td>
      {used && (
        <td className="px-4 py-3 whitespace-nowrap text-ink tabular-nums">
          {k.calls ? `${k.calls.toLocaleString('en-GB')} calls · ${k.tokens.toLocaleString('en-GB')} tokens` : 'Not used'}
        </td>
      )}
      <td className="px-4 py-3">
        <div className="grid justify-items-start gap-2">
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
