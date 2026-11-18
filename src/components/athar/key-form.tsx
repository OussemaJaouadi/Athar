import { useRouter } from "@tanstack/react-router";
import { Check, ChevronsUpDown, CircleAlert, EyeIcon, EyeOffIcon, KeyRound } from "lucide-react";
import { useEffect, useId, useState } from "react";

import { LoadingButton } from "@/components/interior/loading-button";
import { DeskSelect } from "@/components/athar/desk";
import { ProviderMark } from "@/components/athar/provider-mark";
import {
  Combobox,
  ComboboxContent,
  ComboboxCreateNew,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
} from "@/components/kibo-ui/combobox";
import { Alert, AlertDescription, AlertTitle } from "@/components/reui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { PROVIDER_NAME, SUGGESTED_MODELS } from "#/shared/key-models";
import { PROVIDERS, type Provider } from "#/shared/providers";
import { saveKey, type KeyTest } from "#/server/api/keys";

/** The portal's dialog surface: Athar tokens, an edge border, a quiet scrim. */
export const dialogSurface =
  "gap-0 rounded-lg border border-edge bg-surface p-0 text-[0.875rem] text-ink ring-0 shadow-[0_24px_64px_-24px_rgb(0_0_0/0.6)] sm:max-w-[480px] [&>[data-slot=dialog-close]]:top-3 [&>[data-slot=dialog-close]]:end-3";

// What each provider is, in a few words, so the choice can be made without leaving the form.
const PROVIDER_HINT: Record<Provider, string> = {
  openrouter: "One key, models from many providers",
  groq: "Open models, served fast",
  openai: "GPT models",
  anthropic: "Claude models",
  google: "Gemini models",
};

/**
 * "Add a key" in a right-side drawer, composed from library components kept as they ship:
 *  - the form-in-a-sheet layout is ReUI's sheet pattern (c-sheet-2) on shadcn Sheet and Field;
 *  - Provider is a dropdown (shadcn Select, as in ReUI's select-with-icons pattern) with each provider's own mark
 *    from Lobe Icons and a line of what it is;
 *  - Model is Kibo's Combobox: suggestions that filter as you type and a "create new" row for any other id;
 *  - Key is ReUI's password input group (c-input-group-35) with a visibility toggle;
 *  - a failed test is ReUI's destructive Alert (c-alert-4);
 *  - Save is Interior's Loading Button: the label cross-fades to testing, then saved or try again.
 * Save tests the key with its provider first and saves only if the test passes.
 */
export function AddKeyForm({ open, onOpenChange, onSaved }: { open: boolean; onOpenChange: (open: boolean) => void; onSaved: (id: string) => void }) {
  const router = useRouter();
  const id = useId();
  const [name, setName] = useState("");
  const [provider, setProvider] = useState<Provider>("openrouter");
  const [model, setModel] = useState(SUGGESTED_MODELS.openrouter[0]);
  const [typed, setTyped] = useState<string[]>([]);
  const [apiKey, setApiKey] = useState("");
  const [show, setShow] = useState(false);
  const [test, setTest] = useState<KeyTest | null>(null);
  const [nameError, setNameError] = useState<string>();

  // A fresh form every time the drawer opens.
  useEffect(() => {
    if (!open) return;
    setName("");
    setProvider("openrouter");
    setModel(SUGGESTED_MODELS.openrouter[0]);
    setTyped([]);
    setApiKey("");
    setShow(false);
    setTest(null);
    setNameError(undefined);
  }, [open]);

  const models = [...SUGGESTED_MODELS[provider], ...typed.filter((m) => !SUGGESTED_MODELS[provider].includes(m))];
  const ready = !!model.trim() && !!apiKey.trim();

  // Throws on a failed test, so the button shows "Try again" and the alert says why.
  const save = async () => {
    setNameError(undefined);
    setTest(null);
    const r = await saveKey({ data: { name: name.trim() || PROVIDER_NAME[provider], provider, model: model.trim(), apiKey } });
    if (r.field === "name") {
      setNameError(r.message);
      throw new Error(r.message);
    }
    if (!r.saved || !r.id) {
      setTest(r);
      throw new Error(r.message);
    }
    await router.invalidate();
    onOpenChange(false);
    onSaved(r.id);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent showCloseButton={false} className="w-full gap-0 border-edge bg-canvas text-ink sm:max-w-[460px]">
        <SheetHeader className="border-b border-hairline">
          <SheetTitle className="flex items-center gap-2.5 font-display text-[1.375rem] leading-tight font-bold text-ink">
            <KeyRound className="size-5 text-ok" strokeWidth={1.5} aria-hidden />
            Add a key
          </SheetTitle>
          <SheetDescription className="text-ink-2">Bring your own key. It is tested with its provider before it is saved, and it stays on this server.</SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 [scrollbar-width:thin] [scrollbar-color:var(--edge)_transparent]">
          <FieldGroup>
            <Field>
              <FieldLabel id={`${id}-provider`}>Provider</FieldLabel>
              <DeskSelect
                label="Provider"
                value={provider}
                onChange={(v) => {
                  const p = v as Provider;
                  setProvider(p);
                  setModel(SUGGESTED_MODELS[p][0]);
                  setTest(null);
                }}
                options={PROVIDERS.map((p) => ({ value: p, label: PROVIDER_NAME[p], hint: PROVIDER_HINT[p], mark: <ProviderMark provider={p} /> }))}
              />
            </Field>

            <Field>
              <FieldLabel>Model</FieldLabel>
              <Combobox data={models.map((m) => ({ label: m, value: m }))} type="model" value={model} onValueChange={(v) => (setModel(v), setTest(null))}>
                <ComboboxTrigger className="h-9 w-full justify-start gap-2 px-2.5 font-normal">
                  <ProviderMark provider={provider} />
                  <span className="min-w-0 flex-1 truncate text-start font-mono text-[0.8125rem]">{model}</span>
                  <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                </ComboboxTrigger>
                <ComboboxContent>
                  <ComboboxInput placeholder="Search, or type any model id" />
                  <ComboboxEmpty>
                    <ComboboxCreateNew onCreateNew={(v) => setTyped((t) => [...t, v])}>{(v) => <span>Use the model id “{v}”</span>}</ComboboxCreateNew>
                  </ComboboxEmpty>
                  <ComboboxList>
                    <ComboboxGroup heading={`Suggested for ${PROVIDER_NAME[provider]}`}>
                      {models.map((m) => (
                        <ComboboxItem key={m} value={m} className="min-h-9 font-mono text-[0.8125rem]">
                          <span className="min-w-0 flex-1 truncate">{m}</span>
                          {m === model && <Check className="ms-auto size-4" aria-hidden />}
                        </ComboboxItem>
                      ))}
                    </ComboboxGroup>
                  </ComboboxList>
                </ComboboxContent>
              </Combobox>
            </Field>

            <Field>
              <FieldLabel htmlFor={`${id}-key`}>Key</FieldLabel>
              <InputGroup>
                <InputGroupAddon>
                  <KeyRound className="size-4 text-muted-foreground" aria-hidden />
                </InputGroupAddon>
                <InputGroupInput
                  id={`${id}-key`}
                  type={show ? "text" : "password"}
                  autoComplete="new-password"
                  spellCheck={false}
                  className="font-mono"
                  value={apiKey}
                  onChange={(e) => (setApiKey(e.target.value), setTest(null))}
                  placeholder={`Paste your ${PROVIDER_NAME[provider]} key`}
                />
                <InputGroupButton variant="ghost" aria-label={show ? "Hide the key" : "Show the key"} onClick={() => setShow(!show)}>
                  {show ? <EyeOffIcon className="size-4 text-muted-foreground" aria-hidden /> : <EyeIcon className="size-4 text-muted-foreground" aria-hidden />}
                </InputGroupButton>
              </InputGroup>
              <FieldDescription>Only its last four characters are shown again.</FieldDescription>
            </Field>

            <Field data-invalid={nameError ? true : undefined}>
              <FieldLabel htmlFor={`${id}-name`}>
                Name <span className="font-normal text-muted-foreground">(optional)</span>
              </FieldLabel>
              <Input
                id={`${id}-name`}
                autoComplete="off"
                value={name}
                onChange={(e) => (setName(e.target.value), setNameError(undefined))}
                placeholder={PROVIDER_NAME[provider]}
                aria-invalid={nameError ? true : undefined}
              />
              <FieldDescription>{nameError ?? "How it appears in the list. Useful when you keep more than one."}</FieldDescription>
            </Field>

            {test && !test.ok && (
              <Alert variant="destructive">
                <CircleAlert aria-hidden />
                <AlertTitle>{PROVIDER_NAME[provider]} did not accept this</AlertTitle>
                <AlertDescription>
                  <p>{test.message}</p>
                  {test.suggestions && test.suggestions.length > 0 && (
                    <p className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      Close matches:
                      {test.suggestions.map((s) => (
                        <Button
                          key={s}
                          type="button"
                          variant="outline"
                          size="sm"
                          className="font-mono"
                          onClick={() => {
                            setTyped((t) => [...t, s]);
                            setModel(s);
                            setTest(null);
                          }}
                        >
                          {s}
                        </Button>
                      ))}
                    </p>
                  )}
                </AlertDescription>
              </Alert>
            )}
          </FieldGroup>
        </div>

        <SheetFooter className="border-t border-hairline">
          <LoadingButton onAction={save} disabled={!ready} pendingLabel={`Testing with ${PROVIDER_NAME[provider]}`} successLabel="Saved" errorLabel="Try again" className="h-10 w-full">
            Test and save
          </LoadingButton>
          <SheetClose asChild>
            <Button variant="outline">Cancel</Button>
          </SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
