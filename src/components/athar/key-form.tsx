import { useRouter } from '@tanstack/react-router'
import { FlaskConical, LoaderCircle } from 'lucide-react'
import { useEffect, useId, useState } from 'react'

import { DeskSelect, deskBtn, deskInput, deskPrimary } from '@/components/athar/desk'
import { KeyNote } from '@/components/athar/key-ui'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { PROVIDER_NAME, SUGGESTED_MODELS } from '#/shared/key-models'
import { PROVIDERS, type Provider } from '#/shared/providers'
import { saveKey, testNewKey, type KeyTest } from '#/server/api/keys'

const OTHER = '__other'

/** The portal's dialog surface: Athar tokens, an edge border, a quiet scrim. */
export const dialogSurface =
  'gap-0 rounded-lg border border-edge bg-surface p-0 text-[0.875rem] text-ink ring-0 shadow-[0_24px_64px_-24px_rgb(0_0_0/0.6)] sm:max-w-[480px] [&>[data-slot=dialog-close]]:top-3 [&>[data-slot=dialog-close]]:end-3'

/**
 * "Add a key" as a centred dialog: four fields with their labels on the left, the test result under them, then
 * Cancel / Test / Save on one line. Save opens only once a test passed for these exact values.
 */
export function AddKeyDialog({ open, onOpenChange, onSaved }: { open: boolean; onOpenChange: (open: boolean) => void; onSaved: (id: string) => void }) {
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

  // A fresh form every time the dialog opens.
  useEffect(() => {
    if (!open) return
    setName('')
    setProvider('openrouter')
    setChoice(SUGGESTED_MODELS.openrouter[0])
    setCustom('')
    setApiKey('')
    setTest(null)
    setNameError(undefined)
  }, [open])

  const model = choice === OTHER ? custom.trim() : choice
  const signature = `${provider}|${model}|${apiKey.trim()}`
  const passed = !!test?.ok && test.for === signature
  const stale = !!test && test.for !== signature
  const canTest = busy === null && !!model && !!apiKey.trim()

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
        onOpenChange(false)
        onSaved(r.id)
      }
    } catch (e) {
      setTest({ ok: false, message: e instanceof Error ? e.message : String(e), for: signature })
    } finally {
      setBusy(null)
    }
  }

  const row = 'grid grid-cols-[88px_minmax(0,1fr)] items-center gap-x-3'
  const label = 'text-[0.8125rem] text-ink-2'
  const control = cn(deskInput, 'w-full')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={dialogSurface}>
        <div className="grid gap-1 border-b border-hairline px-5 pt-4 pb-3.5">
          <DialogTitle className="font-display text-[1.375rem] leading-tight font-bold text-ink">Add a key</DialogTitle>
          <DialogDescription className="text-[0.8125rem] text-ink-2">
            Tested with its provider before it is saved. The test lists models and spends no tokens.
          </DialogDescription>
        </div>
        <form
          className="grid gap-3 px-5 py-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (passed) save()
            else if (canTest) run()
          }}
        >
          <div className={row}>
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
          </div>
          {nameError && (
            <KeyNote ok={false} className="ms-[100px]">
              <span id={`${id}-name-err`}>{nameError}</span>
            </KeyNote>
          )}
          <div className={row}>
            <label htmlFor={`${id}-provider`} className={label}>
              Provider
            </label>
            <DeskSelect
              id={`${id}-provider`}
              value={provider}
              onChange={(v) => {
                const p = v as Provider
                setProvider(p)
                setChoice(SUGGESTED_MODELS[p][0])
              }}
              options={PROVIDERS.map((p) => ({ value: p, label: PROVIDER_NAME[p] }))}
            />
          </div>
          <div className={row}>
            <label htmlFor={`${id}-model`} className={label}>
              Model
            </label>
            <DeskSelect
              id={`${id}-model`}
              value={choice}
              onChange={setChoice}
              options={[...SUGGESTED_MODELS[provider].map((m) => ({ value: m, label: m })), { value: OTHER, label: 'Other model…' }]}
            />
          </div>
          {choice === OTHER && (
            <div className={row}>
              <label htmlFor={`${id}-custom`} className={label}>
                Model id
              </label>
              <input id={`${id}-custom`} className={control} value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="provider/model" />
            </div>
          )}
          <div className={row}>
            <label htmlFor={`${id}-key`} className={label}>
              Key
            </label>
            <input
              id={`${id}-key`}
              className={control}
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Paste the key"
              aria-describedby={`${id}-key-hint`}
            />
          </div>
          <p id={`${id}-key-hint`} className="ms-[100px] -mt-1.5 text-[0.8125rem] text-ink-2">
            Stays on the server; only its last four characters are shown again.
          </p>

          <div aria-live="polite" className="empty:hidden">
            {stale && <p className="text-[0.875rem] text-ink">The values changed since the last test. Test again to save.</p>}
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
                        className={cn(deskBtn, 'h-7 text-[0.8125rem]')}
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

          <div className="mt-1 flex items-center justify-end gap-2">
            <button type="button" className={deskBtn} onClick={() => onOpenChange(false)}>
              Cancel
            </button>
            <button type="button" className={deskBtn} disabled={!canTest} onClick={run}>
              {busy === 'test' ? <LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden /> : <FlaskConical aria-hidden />}
              {busy === 'test' ? 'Testing…' : test && !stale ? 'Test again' : 'Test'}
            </button>
            <button type="submit" className={deskPrimary} disabled={busy !== null || !passed} aria-describedby={passed ? undefined : `${id}-save-why`}>
              {busy === 'save' && <LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden />}
              {busy === 'save' ? 'Saving…' : 'Save key'}
            </button>
            {!passed && (
              <span id={`${id}-save-why`} className="sr-only">
                Save opens once a test passes.
              </span>
            )}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
