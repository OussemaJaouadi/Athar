import { useRouter } from "@tanstack/react-router";
import { FlaskConical, KeyRound, LoaderCircle, ShieldCheck, Sparkles } from "lucide-react";
import { useEffect, useId, useState } from "react";

import { DeskCombobox, DeskSelect, deskBtn, deskInput, deskPrimary } from "@/components/athar/desk";
import { KeyNote } from "@/components/athar/key-ui";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { PROVIDER_NAME, SUGGESTED_MODELS } from "#/shared/key-models";
import { PROVIDERS, type Provider } from "#/shared/providers";
import { saveKey, type KeyTest } from "#/server/api/keys";

/** The portal's dialog surface: Athar tokens, an edge border, a quiet scrim. */
export const dialogSurface =
  "gap-0 rounded-lg border border-edge bg-surface p-0 text-[0.875rem] text-ink ring-0 shadow-[0_24px_64px_-24px_rgb(0_0_0/0.6)] sm:max-w-[480px] [&>[data-slot=dialog-close]]:top-3 [&>[data-slot=dialog-close]]:end-3";

const drawerSurface =
  "gap-0 border-s border-edge bg-canvas p-0 text-[0.875rem] text-ink shadow-[-24px_0_64px_-32px_rgb(0_0_0/0.6)] data-[side=right]:w-full data-[side=right]:sm:max-w-[460px] [&>[data-slot=sheet-close]]:top-4 [&>[data-slot=sheet-close]]:end-4";

// What each provider is, in a few words, so the choice can be made without leaving the form.
const PROVIDER_HINT: Record<Provider, string> = {
  openrouter: "One key, models from many providers",
  groq: "Open models, served fast",
  openai: "GPT models",
  anthropic: "Claude models",
  google: "Gemini models",
};

/** A provider's initial on a small tile: something to find it by, not a logo. */
function Monogram({ provider }: { provider: Provider }) {
  return (
    <span className="grid size-6 shrink-0 place-items-center rounded-[5px] bg-surface-raised text-[0.8125rem] font-medium text-ink" aria-hidden>
      {PROVIDER_NAME[provider].charAt(0)}
    </span>
  );
}

/**
 * "Add a key" in a right-side drawer. The fields follow the order of the decision: where the key comes from, which
 * model, the key itself, then a name that fills itself in. The one action sits right under the fields; Save tests the
 * key with its provider first and saves only if the test passes. What happens to the key is said once, below.
 */
export function AddKeyForm({ open, onOpenChange, onSaved }: { open: boolean; onOpenChange: (open: boolean) => void; onSaved: (id: string) => void }) {
  const router = useRouter();
  const id = useId();
  const [name, setName] = useState("");
  const [provider, setProvider] = useState<Provider>("openrouter");
  const [model, setModel] = useState(SUGGESTED_MODELS.openrouter[0]);
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [test, setTest] = useState<(KeyTest & { for: string }) | null>(null);
  const [nameError, setNameError] = useState<string>();

  // A fresh form every time the drawer opens.
  useEffect(() => {
    if (!open) return;
    setName("");
    setProvider("openrouter");
    setModel(SUGGESTED_MODELS.openrouter[0]);
    setApiKey("");
    setTest(null);
    setNameError(undefined);
  }, [open]);

  const signature = `${provider}|${model}|${apiKey.trim()}`;
  const failed = !!test && !test.ok && test.for === signature;
  const ready = !!model.trim() && !!apiKey.trim();
  // Left empty, the key is named after its provider.
  const finalName = name.trim() || PROVIDER_NAME[provider];

  const save = async () => {
    setBusy(true);
    setNameError(undefined);
    try {
      const r = await saveKey({ data: { name: finalName, provider, model: model.trim(), apiKey } });
      if (r.field === "name") setNameError(r.message);
      else if (!r.saved || !r.id) setTest({ ...r, for: signature });
      else {
        await router.invalidate();
        onOpenChange(false);
        onSaved(r.id);
      }
    } catch (e) {
      setTest({ ok: false, message: e instanceof Error ? e.message : String(e), for: signature });
    } finally {
      setBusy(false);
    }
  };

  const field = "grid content-start gap-1.5";
  const label = "text-[0.8125rem] font-medium text-ink";
  // Browsers tint a field they fill in themselves; keep the drawer's own surface instead.
  const control = cn(
    deskInput,
    "h-9 w-full rounded-[6px] [&:-webkit-autofill]:[-webkit-text-fill-color:var(--ink)] [&:-webkit-autofill]:shadow-[inset_0_0_0_100px_var(--canvas)]",
  );

  return (
    <Sheet open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <SheetContent side="right" className={drawerSurface}>
        <div className="flex items-center gap-3 border-b border-hairline px-6 py-4 pe-14">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-ok-bg text-ok">
            <KeyRound className="size-[18px]" strokeWidth={1.5} aria-hidden />
          </span>
          <div className="grid gap-0.5">
            <SheetTitle className="font-display text-[1.375rem] leading-tight font-bold text-ink">Add a key</SheetTitle>
            <SheetDescription className="text-[0.8125rem] text-ink-2">Bring your own key from an AI provider.</SheetDescription>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-width:thin] [scrollbar-color:var(--edge)_transparent]">
          <form
            className="grid gap-5 px-6 py-5"
            onSubmit={(e) => {
              e.preventDefault();
              if (ready && !busy) save();
            }}
          >
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
                  setModel(SUGGESTED_MODELS[p][0]);
                }}
                options={PROVIDERS.map((p) => ({ value: p, label: PROVIDER_NAME[p], hint: PROVIDER_HINT[p], mark: <Monogram provider={p} /> }))}
              />
            </div>

            <div className={field}>
              <label htmlFor={`${id}-model`} className={label}>
                Model
              </label>
              <DeskCombobox id={`${id}-model`} label="Model" value={model} onChange={setModel} options={SUGGESTED_MODELS[provider]} searchPlaceholder="Search, or type any model id" />
              <p className="text-[0.8125rem] text-ink-2">Pick a suggestion or type the id {PROVIDER_NAME[provider]} uses for another model.</p>
            </div>

            <div className={field}>
              <label htmlFor={`${id}-key`} className={label}>
                Key
              </label>
              <input
                id={`${id}-key`}
                className={cn(control, "font-mono")}
                type="password"
                autoComplete="new-password"
                spellCheck={false}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={`Paste your ${PROVIDER_NAME[provider]} key`}
              />
            </div>

            <div className={field}>
              <label htmlFor={`${id}-name`} className={label}>
                Name <span className="font-normal text-ink-2">(optional)</span>
              </label>
              <input
                id={`${id}-name`}
                className={control}
                autoComplete="off"
                value={name}
                onChange={(e) => (setName(e.target.value), setNameError(undefined))}
                placeholder={PROVIDER_NAME[provider]}
                aria-invalid={nameError ? true : undefined}
                aria-describedby={nameError ? `${id}-name-err` : `${id}-name-hint`}
              />
              {nameError ? (
                <KeyNote ok={false}>
                  <span id={`${id}-name-err`}>{nameError}</span>
                </KeyNote>
              ) : (
                <p id={`${id}-name-hint`} className="text-[0.8125rem] text-ink-2">
                  How it appears in the list. Useful when you keep more than one.
                </p>
              )}
            </div>

            <div aria-live="polite" className="empty:hidden">
              {failed && (
                <KeyNote ok={false}>
                  <span>{test.message}</span>
                  {test.suggestions && test.suggestions.length > 0 && (
                    <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <span className="text-ink-2">Close matches:</span>
                      {test.suggestions.map((sug) => (
                        <button key={sug} type="button" className={cn(deskBtn, "h-7 font-mono text-[0.8125rem]")} onClick={() => setModel(sug)}>
                          {sug}
                        </button>
                      ))}
                    </span>
                  )}
                </KeyNote>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button type="submit" className={cn(deskPrimary, "h-9 flex-1 justify-center rounded-[6px]")} disabled={!ready || busy}>
                {busy && <LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden />}
                {busy ? `Testing with ${PROVIDER_NAME[provider]}…` : failed ? "Test and save again" : "Test and save"}
              </button>
              <button type="button" className={cn(deskBtn, "h-9 rounded-[6px]")} disabled={busy} onClick={() => onOpenChange(false)}>
                Cancel
              </button>
            </div>
          </form>

          <ul className="grid gap-3 border-t border-hairline px-6 py-5 text-[0.8125rem] text-ink">
            {(
              [
                [FlaskConical, "Tested with the provider before it is saved. A key that fails is not kept."],
                [ShieldCheck, "Stays on this server. Only its last four characters are shown again."],
                [Sparkles, "Used by Prepare and by the idea sentences. Everything else works without a key."],
              ] as const
            ).map(([Icon, text]) => (
              <li key={text} className="flex items-start gap-2.5">
                <Icon className="mt-0.5 size-4 shrink-0 text-ink-2" strokeWidth={1.5} aria-hidden />
                <span>{text}</span>
              </li>
            ))}
          </ul>
        </div>
      </SheetContent>
    </Sheet>
  );
}
