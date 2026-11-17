import { useRouter } from "@tanstack/react-router";
import { FlaskConical, LoaderCircle } from "lucide-react";
import { useEffect, useId, useState } from "react";

import {
  DeskSelect,
  deskBtn,
  deskInput,
  deskPrimary,
} from "@/components/athar/desk";
import { KeyNote } from "@/components/athar/key-ui";
import { cn } from "@/lib/utils";
import { PROVIDER_NAME, SUGGESTED_MODELS } from "#/shared/key-models";
import { PROVIDERS, type Provider } from "#/shared/providers";
import { saveKey, testNewKey, type KeyTest } from "#/server/api/keys";

const OTHER = "__other";

/** The portal's dialog surface: Athar tokens, an edge border, a quiet scrim. */
export const dialogSurface =
  "gap-0 rounded-lg border border-edge bg-surface p-0 text-[0.875rem] text-ink ring-0 shadow-[0_24px_64px_-24px_rgb(0_0_0/0.6)] sm:max-w-[480px] [&>[data-slot=dialog-close]]:top-3 [&>[data-slot=dialog-close]]:end-3";

/**
 * "Add a key", in the page itself: no drawer and no overlay. Four fields in two columns with their labels above, the
 * test result under them, and the actions right below: Test first, then Save once a test passed for these exact values.
 */
export function AddKeyForm({
  open,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (id: string) => void;
}) {
  const router = useRouter();
  const id = useId();
  const [name, setName] = useState("");
  const [provider, setProvider] = useState<Provider>("openrouter");
  const [choice, setChoice] = useState(SUGGESTED_MODELS.openrouter[0]);
  const [custom, setCustom] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState<"test" | "save" | null>(null);
  const [test, setTest] = useState<(KeyTest & { for: string }) | null>(null);
  const [nameError, setNameError] = useState<string>();

  // A fresh form every time the dialog opens.
  useEffect(() => {
    if (!open) return;
    setName("");
    setProvider("openrouter");
    setChoice(SUGGESTED_MODELS.openrouter[0]);
    setCustom("");
    setApiKey("");
    setTest(null);
    setNameError(undefined);
  }, [open]);

  const model = choice === OTHER ? custom.trim() : choice;
  const signature = `${provider}|${model}|${apiKey.trim()}`;
  const passed = !!test?.ok && test.for === signature;
  const stale = !!test && test.for !== signature;
  const canTest = busy === null && !!model && !!apiKey.trim();

  const run = async () => {
    setBusy("test");
    try {
      const r = await testNewKey({ data: { name, provider, model, apiKey } });
      setTest({ ...r, for: signature });
    } catch (e) {
      setTest({
        ok: false,
        message: e instanceof Error ? e.message : String(e),
        for: signature,
      });
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    setBusy("save");
    setNameError(undefined);
    try {
      const r = await saveKey({ data: { name, provider, model, apiKey } });
      if (r.field === "name") setNameError(r.message);
      else if (!r.saved || !r.id) setTest({ ...r, for: signature });
      else {
        await router.invalidate();
        onOpenChange(false);
        onSaved(r.id);
      }
    } catch (e) {
      setTest({
        ok: false,
        message: e instanceof Error ? e.message : String(e),
        for: signature,
      });
    } finally {
      setBusy(null);
    }
  };

  const field = "grid content-start gap-1";
  const label = "text-[0.8125rem] text-ink-2";
  // Browsers tint a field they fill in themselves; keep the page's own surface instead.
  const control = cn(
    deskInput,
    "w-full [&:-webkit-autofill]:[-webkit-text-fill-color:var(--ink)] [&:-webkit-autofill]:shadow-[inset_0_0_0_100px_var(--canvas)]",
  );

  if (!open) return null;
  return (
    <section aria-label="Add a key" className="mb-6 max-w-[760px] border border-edge bg-surface">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-hairline px-5 py-3">
        <h2 className="font-display text-[1.375rem] leading-tight font-bold text-ink">Add a key</h2>
        <p className="text-[0.875rem] text-ink">It is tested before it is saved. The test asks the provider whether the key is accepted and the model is offered; it spends no tokens.</p>
      </div>
      <form
        className="grid gap-4 px-5 py-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (passed) save();
          else if (canTest) run();
        }}
      >
        <div className="grid gap-x-5 gap-y-3 sm:grid-cols-2">
          <div className={field}>
            <label htmlFor={`${id}-name`} className={label}>
              Name
            </label>
            <input
              id={`${id}-name`}
              className={control}
              autoComplete="off"
              autoFocus
              value={name}
              onChange={(e) => (setName(e.target.value), setNameError(undefined))}
              placeholder="e.g. Main, or Fast"
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
            <DeskSelect
              id={`${id}-provider`}
              value={provider}
              onChange={(v) => {
                const p = v as Provider;
                setProvider(p);
                setChoice(SUGGESTED_MODELS[p][0]);
              }}
              options={PROVIDERS.map((p) => ({ value: p, label: PROVIDER_NAME[p] }))}
            />
          </div>
          <div className={field}>
            <label htmlFor={`${id}-model`} className={label}>
              Model
            </label>
            <DeskSelect
              id={`${id}-model`}
              value={choice}
              onChange={setChoice}
              options={[...SUGGESTED_MODELS[provider].map((m) => ({ value: m, label: m })), { value: OTHER, label: "Other model…" }]}
            />
            {choice === OTHER && (
              <input
                id={`${id}-custom`}
                aria-label="Model id"
                className={cn(control, "mt-1")}
                autoComplete="off"
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
              className={control}
              type="password"
              autoComplete="new-password"
              spellCheck={false}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Paste the key"
              aria-describedby={`${id}-key-hint`}
            />
            <p id={`${id}-key-hint`} className="text-[0.8125rem] text-ink-2">
              Stays on the server; only its last four characters are shown again.
            </p>
          </div>
        </div>

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
                      className={cn(deskBtn, "h-7 text-[0.8125rem]")}
                      onClick={() => {
                        setChoice(OTHER);
                        setCustom(s);
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

        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={passed ? deskBtn : deskPrimary} disabled={!canTest} onClick={run}>
            {busy === "test" ? <LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden /> : <FlaskConical aria-hidden />}
            {busy === "test" ? "Testing…" : test && !stale ? "Test again" : "Test the key"}
          </button>
          <button type="submit" className={passed ? deskPrimary : deskBtn} disabled={busy !== null || !passed} aria-describedby={passed ? undefined : `${id}-save-why`}>
            {busy === "save" && <LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden />}
            {busy === "save" ? "Saving…" : "Save key"}
          </button>
          <button type="button" className={deskBtn} onClick={() => onOpenChange(false)}>
            Cancel
          </button>
          {!passed && (
            <span id={`${id}-save-why`} className="text-[0.8125rem] text-ink-2">
              {canTest || busy ? "Save opens once the test passes." : "Choose a model and paste the key to test it."}
            </span>
          )}
        </div>
      </form>
    </section>
  );
}
