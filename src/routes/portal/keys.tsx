import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { labControl, labPrimary } from '@/components/athar/lab'
import { HoldToConfirm } from '@/components/interior/hold-to-confirm'
import { addKey, listKeys, removeKey } from '#/server/api/portal'
import { PROVIDERS } from '#/shared/providers'

export const Route = createFileRoute('/portal/keys')({
  loader: () => listKeys(),
  component: KeysPage,
})
const providerName = (provider: string) =>
  ({
    openrouter: 'OpenRouter',
    groq: 'Groq',
    anthropic: 'Anthropic',
    openai: 'OpenAI',
    google: 'Google',
  })[provider] ?? 'Other provider'
function KeysPage() {
  const keys = Route.useLoaderData()
  const router = useRouter()
  const [error, setError] = useState<string>()
  const [saving, setSaving] = useState(false)
  return (
    <main className="grid gap-6 p-4 lg:p-6">
      <header>
        <h1 className="font-display text-[1.75rem] leading-9 font-medium">
          Keys
        </h1>
        <p className="mt-1 text-ink-2">
          Manage the keys used by Prepare. Key values stay on the server.
        </p>
      </header>
      <div className="grid items-start gap-8 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <section aria-label="Saved keys" className="min-w-0">
          <div className="overflow-x-auto border border-hairline">
            <table className="w-full">
              <thead className="bg-surface text-ink-2">
                <tr>
                  {[
                    'Name',
                    'Provider',
                    'Model',
                    'Key hint',
                    'Status',
                    'Remove',
                  ].map((label) => (
                    <th
                      key={label}
                      className="px-3 py-3 text-start font-medium"
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {keys.map((key) => (
                  <tr key={key.id} className="border-t border-hairline">
                    <td className="px-3 py-3">{key.name}</td>
                    <td className="px-3 py-3">{providerName(key.provider)}</td>
                    <td className="max-w-56 px-3 py-3 font-mono text-sm wrap-anywhere">
                      {key.model}
                    </td>
                    <td className="px-3 py-3 font-mono">{key.hint}</td>
                    <td className="px-3 py-3">
                      {key.status === 'active'
                        ? 'Active'
                        : key.status === 'rate_limited'
                          ? 'Limit reached'
                          : key.status === 'disabled'
                            ? 'Disabled'
                            : 'Unavailable'}
                    </td>
                    <td className="px-3 py-3">
                      <HoldToConfirm
                        confirmLabel="Key removed"
                        className="rounded-[4px]! border-control! border-input! bg-canvas! text-ink! focus-visible:ring-glaze! [&>span[aria-hidden]]:bg-glaze! [&>span[aria-hidden]]:text-glaze-ink! [&>span[aria-hidden]]:text-primary-foreground!"
                        onConfirm={async () => {
                          setError(undefined)
                          try {
                            await removeKey({ data: key.id })
                            await router.invalidate()
                          } catch (err) {
                            setError(
                              err instanceof Error ? err.message : String(err),
                            )
                          }
                        }}
                      >
                        Hold to remove key
                      </HoldToConfirm>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!keys.length && (
            <p className="border-x border-b border-hairline p-4 text-ink-2">
              No key yet. Search, profiles and idea checks work without one;
              Prepare needs a key.
            </p>
          )}
        </section>
        <section className="bg-surface p-4">
          <h2 className="mb-4 text-xl font-medium">Add a key</h2>
          <form
            className="grid gap-4"
            onSubmit={async (event) => {
              event.preventDefault()
              const form = event.currentTarget
              const data = new FormData(form)
              setSaving(true)
              setError(undefined)
              try {
                await addKey({
                  data: {
                    name: String(data.get('name')),
                    provider: String(data.get('provider')),
                    model: String(data.get('model')),
                    apiKey: String(data.get('apiKey')),
                  },
                })
                form.reset()
                await router.invalidate()
              } catch (err) {
                setError(err instanceof Error ? err.message : String(err))
              } finally {
                setSaving(false)
              }
            }}
          >
            <label className="grid gap-1.5">
              Name
              <input
                className={labControl}
                name="name"
                placeholder="Enter a name for this key"
                required
              />
            </label>
            <label className="grid gap-1.5">
              Provider
              <select
                className={labControl}
                name="provider"
                defaultValue=""
                required
              >
                <option value="" disabled>
                  Choose a provider
                </option>
                {PROVIDERS.map((provider) => (
                  <option key={provider} value={provider}>
                    {providerName(provider)}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1.5">
              Model
              <input
                className={labControl}
                name="model"
                placeholder="Enter the provider’s model identifier"
                required
              />
            </label>
            <label className="grid gap-1.5">
              Key
              <input
                className={labControl}
                name="apiKey"
                type="password"
                placeholder="Paste your key"
                autoComplete="off"
                required
              />
            </label>
            <button className={labPrimary} disabled={saving}>
              {saving ? 'Adding key…' : 'Add key'}
            </button>
          </form>
        </section>
      </div>
      {error && (
        <p role="alert" className="text-destructive">
          Key change failed: {error.replace(/[.\s]+$/, '')}. Try again.
        </p>
      )}
    </main>
  )
}
