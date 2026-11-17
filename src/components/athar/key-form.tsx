import { useRouter } from '@tanstack/react-router'
import { FlaskConical, LoaderCircle, Save } from 'lucide-react'
import { useId, useState } from 'react'

import { KeyNote, keyControl, keyPrimary, keySecondary } from '@/components/athar/key-ui'
import { PROVIDER_NAME, SUGGESTED_MODELS } from '#/shared/key-models'
import { PROVIDERS, type Provider } from '#/shared/providers'
import { saveKey, testNewKey, type KeyTest } from '#/server/api/keys'

const OTHER = '__other'

/** Add a key: test it against the provider first; Save opens only once the test passed for these exact values. */
export function KeyForm({ first }: { first: boolean }) {
  const router = useRouter()
  const id = useId()
  const [name, setName] = useState('')
  const [provider, setProvider] = useState<Provider>('openrouter')
  const [choice, setChoice] = useState(SUGGESTED_MODELS.openrouter[0])
  const [custom, setCustom] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [busy, setBusy] = useState<'test' | 'save' | null>(null)
  const [test, setTest] = useState<(KeyTest & { for: string }) | null>(null)
  const [nameError, setNameError] = useState<string>()
  const [saved, setSaved] = useState<string>()

  const model = choice === OTHER ? custom.trim() : choice
  const signature = `${provider}|${model}|${apiKey.trim()}`
  const passed = test?.ok && test.for === signature
  const stale = test && test.for !== signature

  const run = async () => {
    setBusy('test')
    setSaved(undefined)
    try {
      const r = await testNewKey({ data: { name, provider, model, apiKey } })
      setTest({ ...r, for: signature })
    } catch (e) {
      setTest({ ok: false, message: e instanceof Error ? e.message : String(e), for: signature })
    } finally {
      setBusy(null)
    }
  }

  const save = async () => {
    setBusy('save')
    setNameError(undefined)
    try {
      const r = await saveKey({ data: { name, provider, model, apiKey } })
      if (r.field === 'name') setNameError(r.message)
      else if (!r.saved) setTest({ ...r, for: signature })
      else {
        setSaved(`${name.trim()} is saved.`)
        setName('')
        setApiKey('')
        setTest(null)
        await router.invalidate()
      }
    } catch (e) {
      setTest({ ok: false, message: e instanceof Error ? e.message : String(e), for: signature })
    } finally {
      setBusy(null)
    }
  }

  const label = 'grid content-start gap-1.5 text-[0.8125rem] font-medium text-ink-2'
  return (
    <form
      className="grid gap-5"
      onSubmit={(e) => {
        e.preventDefault()
        if (passed) save()
        else run()
      }}
    >
      <div className={first ? 'grid gap-5 md:grid-cols-2' : 'grid gap-5'}>
        <div className={label}>
          <label htmlFor={`${id}-name`}>Name</label>
          <input
            id={`${id}-name`}
            className={keyControl}
            value={name}
            onChange={(e) => (setName(e.target.value), setNameError(undefined))}
            placeholder="For example: OpenRouter main"
            aria-invalid={nameError ? true : undefined}
            aria-describedby={nameError ? `${id}-name-err` : undefined}
          />
          {nameError && (
            <KeyNote ok={false} className="mt-1">
              <span id={`${id}-name-err`}>{nameError}</span>
            </KeyNote>
          )}
        </div>
        <div className={label}>
          <label htmlFor={`${id}-provider`}>Provider</label>
          <select
            id={`${id}-provider`}
            className={keyControl}
            value={provider}
            onChange={(e) => {
              const p = e.target.value as Provider
              setProvider(p)
              setChoice(SUGGESTED_MODELS[p][0])
            }}
          >
            {PROVIDERS.map((p) => (
              <option key={p} value={p}>
                {PROVIDER_NAME[p]}
              </option>
            ))}
          </select>
        </div>
        <div className={label}>
          <label htmlFor={`${id}-model`}>Model</label>
          <select id={`${id}-model`} className={keyControl} value={choice} onChange={(e) => setChoice(e.target.value)}>
            {SUGGESTED_MODELS[provider].map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
            <option value={OTHER}>Other model…</option>
          </select>
          {choice === OTHER && (
            <input
              aria-label="Model id"
              className={`${keyControl} mt-1.5 font-mono`}
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              placeholder="The provider's model id"
            />
          )}
        </div>
        <div className={label}>
          <label htmlFor={`${id}-key`}>Key</label>
          <input
            id={`${id}-key`}
            className={`${keyControl} font-mono`}
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="Paste the key"
          />
          <span className="text-[0.8125rem] font-normal text-ink-2">Stays on the server. Only its last four characters are shown again.</span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className={keySecondary} disabled={busy !== null || !model || !apiKey.trim()} onClick={run}>
          {busy === 'test' ? <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden /> : <FlaskConical className="size-4" aria-hidden />}
          {busy === 'test' ? 'Testing…' : test && !stale ? 'Test again' : 'Test key'}
        </button>
        <button type="button" className={keyPrimary} disabled={busy !== null || !passed} onClick={save}>
          {busy === 'save' ? <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden /> : <Save className="size-4" aria-hidden />}
          {busy === 'save' ? 'Saving…' : 'Save key'}
        </button>
        {!passed && !test && <span className="text-[0.875rem] text-ink">Save opens once the test passes.</span>}
      </div>

      <div aria-live="polite" className="grid gap-2">
        {test && stale && <p className="text-[0.875rem] text-ink">The values changed since the last test. Test again to save.</p>}
        {test && !stale && (
          <KeyNote ok={test.ok}>
            <p>{test.message}</p>
            {test.suggestions && test.suggestions.length > 0 && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="text-[0.8125rem] text-ink-2">Close matches:</span>
                {test.suggestions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className="h-8 rounded-md border border-edge px-2.5 font-mono text-[0.8125rem] text-ink hover:border-ink focus-visible:outline-2 focus-visible:outline-glaze"
                    onClick={() => {
                      setChoice(OTHER)
                      setCustom(s)
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </KeyNote>
        )}
        {saved && <KeyNote ok>{saved}</KeyNote>}
      </div>
    </form>
  )
}
