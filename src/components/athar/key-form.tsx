import { useRouter } from '@tanstack/react-router'
import { FlaskConical, LoaderCircle, Save } from 'lucide-react'
import { useId, useState } from 'react'

import { DeskPane, deskBtn, deskInput, deskPrimary } from '@/components/athar/desk'
import { KeyNote } from '@/components/athar/key-ui'
import { cn } from '@/lib/utils'
import { PROVIDER_NAME, SUGGESTED_MODELS } from '#/shared/key-models'
import { PROVIDERS, type Provider } from '#/shared/providers'
import { saveKey, testNewKey, type KeyTest } from '#/server/api/keys'

const OTHER = '__other'

/**
 * "Add a key" in the Keys pane: four 32px fields (max 420px wide), Test and Save in the foot bar. Save opens only
 * once a test passed for these exact values.
 */
export function AddKeyPane({ onSaved }: { onSaved: (id: string) => void }) {
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

  const model = choice === OTHER ? custom.trim() : choice
  const signature = `${provider}|${model}|${apiKey.trim()}`
  const passed = test?.ok && test.for === signature
  const stale = test && test.for !== signature
  const formId = `${id}-form`

  const run = async () => {
    setBusy('test')
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
      else if (!r.saved || !r.id) setTest({ ...r, for: signature })
      else {
        await router.invalidate()
        onSaved(r.id)
      }
    } catch (e) {
      setTest({ ok: false, message: e instanceof Error ? e.message : String(e), for: signature })
    } finally {
      setBusy(null)
    }
  }

  const field = 'grid gap-1'
  const label = 'text-[0.8125rem] text-ink-2'
  const control = cn(deskInput, 'w-full')
  return (
    <DeskPane
      title="Add a key"
      statement="No engine uses a key yet."
      foot={
        <>
          <button type="button" className={deskBtn} disabled={busy !== null || !model || !apiKey.trim()} onClick={run}>
            {busy === 'test' ? <LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden /> : <FlaskConical aria-hidden />}
            {busy === 'test' ? 'Testing…' : test && !stale ? 'Test again' : 'Test'}
          </button>
          <button type="submit" form={formId} className={deskPrimary} disabled={busy !== null || !passed} title={passed ? undefined : 'Test the key first'}>
            {busy === 'save' ? <LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden /> : <Save aria-hidden />}
            {busy === 'save' ? 'Saving…' : 'Save'}
          </button>
          <span className="text-[0.8125rem] text-ink-2">{passed ? 'The test passed.' : 'Save opens once a test passes. The test spends no tokens.'}</span>
        </>
      }
    >
      <form
        id={formId}
        aria-label="Add a key"
        className="grid max-w-[420px] gap-3.5"
        onSubmit={(e) => {
          e.preventDefault()
          if (passed) save()
          else run()
        }}
      >
        <div className={field}>
          <label htmlFor={`${id}-name`} className={label}>
            Name
          </label>
          <input
            id={`${id}-name`}
            className={control}
            value={name}
            onChange={(e) => (setName(e.target.value), setNameError(undefined))}
            placeholder="OpenRouter main"
            aria-invalid={nameError ? true : undefined}
            aria-describedby={nameError ? `${id}-name-err` : undefined}
          />
          {nameError && (
            <KeyNote ok={false}>
              <span id={`${id}-name-err`}>{nameError}</span>
            </KeyNote>
          )}
        </div>
        <div className={field}>
          <label htmlFor={`${id}-provider`} className={label}>
            Provider
          </label>
          <select
            id={`${id}-provider`}
            className={control}
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
        <div className={field}>
          <label htmlFor={`${id}-model`} className={label}>
            Model
          </label>
          <select id={`${id}-model`} className={control} value={choice} onChange={(e) => setChoice(e.target.value)}>
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
              className={cn(control, 'mt-1.5 font-mono text-[0.8125rem]')}
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              placeholder="provider/model"
            />
          )}
        </div>
        <div className={field}>
          <label htmlFor={`${id}-key`} className={label}>
            Key
          </label>
          <input
            id={`${id}-key`}
            className={cn(control, 'font-mono text-[0.8125rem]')}
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="Paste the key"
            aria-describedby={`${id}-key-hint`}
          />
          <p id={`${id}-key-hint`} className="text-[0.8125rem] text-ink-2">
            Stays on the server. Only its last four characters are shown again.
          </p>
        </div>

        <div aria-live="polite" className="grid gap-1.5 empty:hidden">
          {test && stale && <p className="text-[0.875rem] text-ink">The values changed since the last test. Test again to save.</p>}
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
                      className={cn(deskBtn, 'h-7 font-mono text-[0.8125rem]')}
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
        </div>
      </form>
    </DeskPane>
  )
}
