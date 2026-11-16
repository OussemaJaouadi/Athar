import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useState } from 'react'

import { PROVIDERS } from '#/shared/providers'
import { addKey, listKeys, removeKey } from '#/server/api/portal'

export const Route = createFileRoute('/portal/keys')({
  loader: () => listKeys(),
  component: KeysPage,
})

// Keys: a provider, a key and a model; Prepare and generated text use them.
function KeysPage() {
  const keys = Route.useLoaderData()
  const router = useRouter()
  const [error, setError] = useState<string>()

  return (
    <main className="page">
      <h1>Keys</h1>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Provider</th>
              <th>Model</th>
              <th>Key</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {keys.map((k) => (
              <tr key={k.id}>
                <td>{k.name}</td>
                <td>{k.provider}</td>
                <td className="mono">{k.model}</td>
                <td className="mono">{k.hint}</td>
                <td>{k.status}</td>
                <td>
                  <button
                    className="btn secondary"
                    onClick={async () => {
                      await removeKey({ data: k.id })
                      router.invalidate()
                    }}
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {keys.length === 0 && <p className="muted">No keys yet. Free keys from OpenRouter or Groq work.</p>}
      </div>

      <form
        className="panel row"
        onSubmit={async (e) => {
          e.preventDefault()
          const form = e.currentTarget
          const f = new FormData(form)
          setError(undefined)
          try {
            await addKey({
              data: { name: String(f.get('name')), provider: String(f.get('provider')), model: String(f.get('model')), apiKey: String(f.get('apiKey')) },
            })
            form.reset()
            router.invalidate()
          } catch (err) {
            setError(err instanceof Error ? err.message : String(err))
          }
        }}
      >
        <input className="field" name="name" placeholder="Name" aria-label="Name" required />
        <select className="field" name="provider" aria-label="Provider">
          {PROVIDERS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <input className="field" name="model" placeholder="Model" aria-label="Model" required />
        <input className="field" name="apiKey" type="password" placeholder="API key" aria-label="API key" required autoComplete="off" />
        <button className="btn" type="submit">
          Add key
        </button>
      </form>
      {error && <p className="error">{error}</p>}
    </main>
  )
}
