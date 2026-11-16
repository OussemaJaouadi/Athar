import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useState } from 'react'

import { PageHeader, Panel, SampleTag, shortDate } from '@/components/athar/kit'
import { HoldToConfirm } from '@/components/interior/hold-to-confirm'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { addKey, listKeys, removeKey } from '#/server/api/portal'
import { getKeyUsage } from '#/server/api/sample'
import { PROVIDERS } from '#/shared/providers'

export const Route = createFileRoute('/portal/keys')({
  loader: async () => {
    const [keys, usage] = await Promise.all([listKeys(), getKeyUsage()])
    return { keys, usage }
  },
  component: KeysPage,
})

const MODELS: Record<string, string> = {
  openrouter: 'meta-llama/llama-3.3-70b-instruct:free',
  groq: 'llama-3.3-70b-versatile',
  anthropic: 'claude-haiku-5-5',
}

// Keys: profiles of provider, key and model. Prepare and the archivist rotate through them in order.
function KeysPage() {
  const { keys, usage } = Route.useLoaderData()
  const router = useRouter()
  const [error, setError] = useState<string>()
  const [provider, setProvider] = useState<string>(PROVIDERS[0])

  return (
    <main className="grid grid-cols-[minmax(0,1fr)] gap-4 p-4 lg:p-6">
      <PageHeader eyebrow="AI keys" title="Bring your own key">
        Free keys from OpenRouter or Groq work. When one hits its limit, the next in order takes over. The key itself never leaves the server.
      </PageHeader>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <Panel title="Profiles, in rotation order" meta={<><SampleTag title="Usage numbers are samples until Prepare records real calls" /> usage, last 7 days</>} bodyClassName="p-0 overflow-x-auto">
          <table className="w-full">
            <thead className="text-ink-2">
              <tr className="border-b border-hairline">
                {['#', 'Name', 'Provider · model', 'Key', 'Status', 'Tokens', 'Calls', 'Failed', 'Limit left', 'Last used', ''].map((h, i) => (
                  <th key={i} className="px-3 py-2 text-start font-medium whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...keys, ...usage.examples].map((k) => {
                const u = usage.perKey[k.id]
                const example = k.id.startsWith('example-')
                return (
                  <tr key={k.id} className={cn('border-b border-hairline last:border-0', example && 'text-ink-2')}>
                    <td className="px-3 py-2 font-mono text-xs text-ink-2">{u?.order}</td>
                    <td className="px-3 py-2 font-medium">
                      <span className="flex items-center gap-2">{k.name} {example && <SampleTag title="Example profile: not stored, disappears when you add a real key" />}</span>
                    </td>
                    <td className="px-3 py-2">
                      <div>{k.provider}</div>
                      <div className="font-mono text-[0.6875rem] text-ink-2">{k.model}</div>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{k.hint}</td>
                    <td className="px-3 py-2">
                      <span className="flex items-center gap-1.5">
                        <span className={cn('size-1.5 rounded-full', k.status === 'active' ? 'bg-glaze' : 'bg-zinc-400')} />
                        {k.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs tabular-nums">{u ? `${(u.tokens7d / 1000).toFixed(0)}k` : '—'}</td>
                    <td className="px-3 py-2 font-mono text-xs tabular-nums">{u?.requests7d ?? '—'}</td>
                    <td className={cn('px-3 py-2 font-mono text-xs tabular-nums', u && u.failures7d > 6 && 'text-destructive')}>{u?.failures7d ?? '—'}</td>
                    <td className="px-3 py-2">
                      {u && (
                        <span className="flex items-center gap-2 font-mono text-xs">
                          <span className="h-1 w-14 bg-surface-raised">
                            <span className={cn('block h-full', u.limitLeft < 40 ? 'bg-ochre' : 'bg-zinc-700')} style={{ width: `${u.limitLeft}%` }} />
                          </span>
                          {u.limitLeft}%
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs whitespace-nowrap text-ink-2">{u ? shortDate(u.lastUsed) : '—'}</td>
                    <td className="px-3 py-2 text-end">
                      {!example && (
                      <HoldToConfirm
                        confirmLabel="Removed"
                        onConfirm={async () => {
                          await removeKey({ data: k.id })
                          router.invalidate()
                        }}
                      >
                        Hold to remove
                      </HoldToConfirm>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {keys.length === 0 && (
            <div className="grid gap-1 border-t border-hairline px-4 py-4 text-center">
              <p className="font-medium">No keys yet</p>
              <p className="text-ink-2">Search, similarity and idea checks work without one. Prepare and written answers need a key.</p>
            </div>
          )}
        </Panel>

        <Panel title="Add a profile">
          <form
            className="grid gap-3"
            onSubmit={async (e) => {
              e.preventDefault()
              const form = e.currentTarget
              const f = new FormData(form)
              setError(undefined)
              try {
                await addKey({ data: { name: String(f.get('name')), provider: String(f.get('provider')), model: String(f.get('model')), apiKey: String(f.get('apiKey')) } })
                form.reset()
                router.invalidate()
              } catch (err) {
                setError(err instanceof Error ? err.message : String(err))
              }
            }}
          >
            <label className="grid gap-1">
              <span className="text-xs text-ink-2">Name</span>
              <Input name="name" placeholder="groq-free" aria-label="Name" required />
            </label>
            <label className="grid gap-1">
              <span className="text-xs text-ink-2">Provider</span>
              <select name="provider" aria-label="Provider" value={provider} onChange={(e) => setProvider(e.target.value)} className="h-8 rounded-md border border-input bg-background px-2">
                {PROVIDERS.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-1">
              <span className="text-xs text-ink-2">Model</span>
              <Input key={provider} name="model" defaultValue={MODELS[provider]} placeholder="model id from the provider" aria-label="Model" required className="font-mono text-xs" />
            </label>
            <label className="grid gap-1">
              <span className="text-xs text-ink-2">API key</span>
              <Input name="apiKey" type="password" placeholder="pasted once, kept on the server" aria-label="API key" required autoComplete="off" />
            </label>
            <Button type="submit">Add key</Button>
            {error && <p className="text-destructive">{error}</p>}
          </form>
        </Panel>
      </div>
    </main>
  )
}
