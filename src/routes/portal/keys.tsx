import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useState } from 'react'

import { HoldToConfirm } from '@/components/interior/hold-to-confirm'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { addKey, listKeys, removeKey } from '#/server/api/portal'
import { PROVIDERS } from '#/shared/providers'

export const Route = createFileRoute('/portal/keys')({
  loader: () => listKeys(),
  component: KeysPage,
})

// Keys: a provider, a key and a model. Prepare and the archivist's written answers use them.
function KeysPage() {
  const keys = Route.useLoaderData()
  const router = useRouter()
  const [error, setError] = useState<string>()

  return (
    <main className="mx-auto grid max-w-7xl gap-6 px-5 py-6">
      <header className="grid gap-1">
        <h1 className="text-xl font-semibold">Keys</h1>
        <p className="text-ink-2">Free keys from OpenRouter or Groq work. The key itself never leaves the server.</p>
      </header>

      <div className="overflow-x-auto border border-hairline bg-canvas">
        <table className="w-full">
          <thead className="text-ink-2">
            <tr className="border-b border-hairline">
              {['Name', 'Provider', 'Model', 'Key', 'Status', ''].map((h, i) => (
                <th key={i} className="px-3 py-2 text-start font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {keys.map((k) => (
              <tr key={k.id} className="border-b border-hairline last:border-0">
                <td className="px-3 py-2">{k.name}</td>
                <td className="px-3 py-2">{k.provider}</td>
                <td className="px-3 py-2 font-mono text-xs">{k.model}</td>
                <td className="px-3 py-2 font-mono text-xs">{k.hint}</td>
                <td className="px-3 py-2">{k.status}</td>
                <td className="px-3 py-2 text-end">
                  <HoldToConfirm
                    confirmLabel="Removed"
                    onConfirm={async () => {
                      await removeKey({ data: k.id })
                      router.invalidate()
                    }}
                  >
                    Hold to remove
                  </HoldToConfirm>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {keys.length === 0 && <p className="px-3 py-6 text-ink-2">No keys yet.</p>}
      </div>

      <form
        className="flex flex-wrap items-center gap-2 border border-hairline bg-canvas p-3"
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
        <Input name="name" placeholder="Name" aria-label="Name" required className="w-40" />
        <select name="provider" aria-label="Provider" className="h-9 rounded-md border border-input bg-background px-2">
          {PROVIDERS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <Input name="model" placeholder="Model" aria-label="Model" required className="w-56" />
        <Input name="apiKey" type="password" placeholder="API key" aria-label="API key" required autoComplete="off" className="min-w-0 flex-1 basis-56" />
        <Button type="submit">Add key</Button>
      </form>
      {error && <p className="text-destructive">{error}</p>}
    </main>
  )
}
