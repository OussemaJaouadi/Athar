import { useRouter } from '@tanstack/react-router'
import { FlaskConical, LoaderCircle, Save } from 'lucide-react'
import { useId, useState } from 'react'

import { KeyNote } from '@/components/athar/key-ui'
import { opsButton, opsControl, opsPrimary } from '@/components/athar/ops'
import { cn } from '@/lib/utils'
import { PROVIDER_NAME, SUGGESTED_MODELS } from '#/shared/key-models'
import { PROVIDERS, type Provider } from '#/shared/providers'
import { saveKey, testNewKey, type KeyTest } from '#/server/api/keys'

const OTHER = '__other'

/**
 * Add a key, in one row: Name · Provider · Model · Key · Test · Save. Save opens only once a test passed for these
 * exact values; the result is one line under the row.
 */
export function KeyForm() {
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

  const field = 'grid content-start gap-1'
  const label = 'text-[0.8125rem] text-ink-2'
  return (
    <form
      aria-label="Add a key"
      className="grid gap-2.5 rounded-md border border-edge bg-surface p-3"
      onSubmit={(e) => {
        e.preventDefault()
        if (passed) save()
        else run()
      }}
    >
      <div className="flex flex-wrap items-end gap-2.5">
        <div className={cn(field, 'w-48')}>
          <label htmlFor={`${id}-name`} className={label}>
            Name
          </label>
          <input
            id={`${id}-name`}
            className={cn(opsControl, 'w-full min-w-0')}
            value={name}
            onChange={(e) => (setName(e.target.value), setNameError(undefined))}
            placeholder="OpenRouter main"
            aria-invalid={nameError ? true : undefined}
            aria-describedby={nameError ? `${id}-name-err` : undefined}
          />
        </div>
        <div className={cn(field, 'w-36')}>
          <label htmlFor={`${id}-provider`} className={label}>
            Provider
          </label>
          <select
            id={`${id}-provider`}
            className={cn(opsControl, 'w-full min-w-0')}
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
        <div className={cn(field, 'w-52')}>
          <label htmlFor={`${id}-model`} className={label}>
            Model
          </label>
          <select id={`${id}-model`} className={cn(opsControl, 'w-full min-w-0')} value={choice} onChange={(e) => setChoice(e.target.value)}>
            {SUGGESTED_MODELS[provider].map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
            <option value={OTHER}>Other model…</option>
          </select>
        </div>
        {choice === OTHER && (
          <div className={cn(field, 'w-52')}>
            <label htmlFor={`${id}-custom`} className={label}>
              Model id
            </label>
            <input
              id={`${id}-custom`}
              className={cn(opsControl, 'w-full min-w-0 font-mono')}
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              placeholder="provider/model"
            />
          </div>
        )}
        <div className={cn(field, 'min-w-56 flex-1')}>
          <label htmlFor={`${id}-key`} className={label}>
            Key <span className="sr-only">(stays on the server; only its last four characters are shown again)</span>
          </label>
          <input
            id={`${id}-key`}
            className={cn(opsControl, 'w-full min-w-0 font-mono')}
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="Paste the key"
            title="Stays on the server. Only its last four characters are shown again."
          />
        </div>
        <button type="button" className={opsButton} disabled={busy !== null || !model || !apiKey.trim()} onClick={run}>
          {busy === 'test' ? <LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden /> : <FlaskConical aria-hidden />}
          {busy === 'test' ? 'Testing…' : test && !stale ? 'Test again' : 'Test'}
        </button>
        <button type="button" className={opsPrimary} disabled={busy !== null || !passed} title={passed ? undefined : 'Test the key first'} onClick={save}>
          {busy === 'save' ? <LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden /> : <Save aria-hidden />}
          {busy === 'save' ? 'Saving…' : 'Save'}
        </button>
      </div>

      <div aria-live="polite" className="grid gap-1.5 empty:hidden">
        {nameError && (
          <KeyNote ok={false}>
            <span id={`${id}-name-err`}>{nameError}</span>
          </KeyNote>
        )}
        {!test && !saved && <p className="text-[0.8125rem] text-ink">Test the key with its provider first; Save opens once it passes. The test spends no tokens.</p>}
        {test && stale && <p className="text-[0.8125rem] text-ink">The values changed since the last test. Test again to save.</p>}
        {test && !stale && (
          <KeyNote ok={test.ok}>
            <span>{test.message}</span>
            {test.suggestions && test.suggestions.length > 0 && (
              <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <span className="text-ink-2">Close matches:</span>
                {test.suggestions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className={cn(opsButton, 'h-7 font-mono font-normal')}
                    onClick={() => {
                      setChoice(OTHER)
                      setCustom(s)
                    }}
                  >
                    {s}
                  </button>
                ))}
              </span>
            )}
          </KeyNote>
        )}
        {saved && <KeyNote ok>{saved}</KeyNote>}
      </div>
    </form>
  )
}
