import { useRouter } from "@tanstack/react-router";
import { KeyRound, LoaderCircle, ShieldCheck } from "lucide-react";
import { useEffect, useId, useState } from "react";

import {
  DeskSelect,
  deskBtn,
  deskInput,
  deskPrimary,
} from "@/components/athar/desk";
import { KeyNote } from "@/components/athar/key-ui";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { PROVIDER_NAME, SUGGESTED_MODELS } from "#/shared/key-models";
import { PROVIDERS, type Provider } from "#/shared/providers";
import { saveKey, type KeyTest } from "#/server/api/keys";

const OTHER = "__other";

/** The portal's dialog surface: Athar tokens, an edge border, a quiet scrim. */
export const dialogSurface =
  "gap-0 rounded-lg border border-edge bg-surface p-0 text-[0.875rem] text-ink ring-0 shadow-[0_24px_64px_-24px_rgb(0_0_0/0.6)] sm:max-w-[480px] [&>[data-slot=dialog-close]]:top-3 [&>[data-slot=dialog-close]]:end-3";

/**
 * "Add a key": a small centred dialog sized to its four fields, the pattern every provider console uses for a secret.
 * One action: Save tests the key with its provider first and saves only if the test passes; a failure is shown
 * under the fields with what to fix. Nothing to remember between two buttons.
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
  const [busy, setBusy] = useState<"save" | null>(null);
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
  const stale = !!test && test.for !== signature;

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

  const field = "grid content-start gap-1.5";
  const label = "text-[0.8125rem] font-medium text-ink";
  // Browsers tint a field they fill in themselves; keep the dialog's own surface instead.
  const control = cn(
    deskInput,
    "h-9 w-full [&:-webkit-autofill]:[-webkit-text-fill-color:var(--ink)] [&:-webkit-autofill]:shadow-[inset_0_0_0_100px_var(--canvas)]",
  );
  const ready = !!name.trim() && !!model && !!apiKey.trim();
  const failed = test && !test.ok && !stale;

  return (
    <Dialog open={open} onOpenChange={(o) => busy === null && onOpenChange(o)}>
      <DialogContent className={cn(dialogSurface, "sm:max-w-[440px]")}>
        <div className="flex items-start gap-3 px-5 pt-5">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-ok-bg text-ok">
            <KeyRound className="size-[18px]" strokeWidth={1.5} aria-hidden />
          </span>
          <div className="grid gap-0.5">
            <DialogTitle className="font-display text-[1.375rem] leading-tight font-bold text-ink">Add a key</DialogTitle>
            <DialogDescription className="text-[0.8125rem] text-ink-2">Used by Prepare and by the idea sentences.</DialogDescription>
          </div>
        </div>
        <form
          className="grid gap-4 px-5 pt-4 pb-5"
          onSubmit={(e) => {
            e.preventDefault();
            if (ready && busy === null) save();
          }}
        >
          <div className={field}>
            <label htmlFor={`${id}-name`} className={label}>
              Name
            </label>
            <input
              id={`${id}-name`}
              className={control}
              autoComplete="off"
              value={name}
              onChange={(e) => (setName(e.target.value), setNameError(undefined))}
              placeholder="Main"
              aria-invalid={nameError ? true : undefined}
              aria-describedby={nameError ? `${id}-name-err` : undefined}
            />
            {nameError && (
              <KeyNote ok={false}>
                <span id={`${id}-name-err`}>{nameError}</span>
              </KeyNote>
            )}
          </div>
          <div className="grid gap-4 sm:grid-cols-[150px_minmax(0,1fr)]">
            <div className={field}>
              <label htmlFor={`${id}-provider`} className={label}>
                Provider
              </label>
              <DeskSelect
                id={`${id}-provider`}
                className="h-9"
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
                className="h-9"
                value={choice}
                onChange={setChoice}
                options={[...SUGGESTED_MODELS[provider].map((m) => ({ value: m, label: m })), { value: OTHER, label: "Other model…" }]}
              />
            </div>
          </div>
          {choice === OTHER && (
            <div className={field}>
              <label htmlFor={`${id}-custom`} className={label}>
                Model id
              </label>
              <input id={`${id}-custom`} className={control} autoComplete="off" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="provider/model" />
            </div>
          )}
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
              placeholder="Paste the key"
              aria-describedby={`${id}-key-hint`}
            />
            <p id={`${id}-key-hint`} className="flex items-start gap-1.5 text-[0.8125rem] text-ink-2">
              <ShieldCheck className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} aria-hidden />
              Stays on this server. Only its last four characters are shown again.
            </p>
          </div>

          <div aria-live="polite" className="empty:hidden">
            {failed && (
              <KeyNote ok={false}>
                <span>{test.message}</span>
                {test.suggestions && test.suggestions.length > 0 && (
                  <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <span className="text-ink-2">Close matches:</span>
                    {test.suggestions.map((sug) => (
                      <button
                        key={sug}
                        type="button"
                        className={cn(deskBtn, "h-7 text-[0.8125rem]")}
                        onClick={() => {
                          setChoice(OTHER);
                          setCustom(sug);
                        }}
                      >
                        {sug}
                      </button>
                    ))}
                  </span>
                )}
              </KeyNote>
            )}
          </div>

          <div className="flex items-center justify-end gap-2">
            <button type="button" className={cn(deskBtn, "h-9")} disabled={busy !== null} onClick={() => onOpenChange(false)}>
              Cancel
            </button>
            <button type="submit" className={cn(deskPrimary, "h-9 min-w-[150px] justify-center")} disabled={!ready || busy !== null}>
              {busy === "save" && <LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden />}
              {busy === "save" ? `Testing with ${PROVIDER_NAME[provider]}…` : failed ? "Test and save again" : "Test and save"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
