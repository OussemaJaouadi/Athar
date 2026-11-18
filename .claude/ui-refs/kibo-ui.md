Site: https://www.kibo-ui.com (pulled 2026-11-16)

# Kibo UI components

Neither page gave a props table, a usage sample or a dependency list. The page content was partly script-rendered.

## Glimpse

- URL: https://www.kibo-ui.com/components/glimpse
- Install: `npx kibo-ui add glimpse`
- The page also mentions the shadcn CLI as an alternative but shows no shadcn command.
- Props/API: not on the page. It mentions customizable `className` and hover-card appearance, without naming props.
- Usage: not in the fetched content (code previews were script-rendered).
- Dependencies: not listed.
- Summary: shows a preview (title, description, image) when a user hovers a link. Fetches data in a React Server Component, respects reduced motion, works on any link or `role="link"` element.

## Status

- URL: https://www.kibo-ui.com/components/status
- Install: `npx kibo-ui add status`
- The page shows only the Kibo UI command, no shadcn command.
- Props/API: not on the page.
- Usage: a "Custom styles" example exists, but its code was script-rendered and not available.
- Dependencies: not listed.
- Summary: displays a service's uptime status. Features: automatic colors per status, customizable colors and labels, ping animation on the indicator.

## Added 2026-11-17 (operator portal)

Registry: `https://www.kibo-ui.com/r/<name>.json`. The `kibo-ui add` CLI stops on its overwrite question when a shared primitive already exists; fetch the JSON and write the file to `src/components/kibo-ui/<name>.tsx`, then fix the `@repo/shadcn-ui/...` imports to `@/components/ui/...`.

- **choicebox** → `src/components/kibo-ui/choicebox.tsx`. Radio options as cards: `Choicebox` (a RadioGroup), `ChoiceboxItem` (`value`, `id`), `ChoiceboxItemHeader`, `ChoiceboxItemTitle`, `ChoiceboxItemDescription`, `ChoiceboxIndicator`. Needs shadcn `radio-group` and `field`. Used for the provider choice in the AI key drawer.
- **combobox** → `src/components/kibo-ui/combobox.tsx`. `Combobox` (`data: {label,value}[]`, `type`, `value`, `onValueChange`), `ComboboxTrigger`, `ComboboxContent`, `ComboboxInput`, `ComboboxList`, `ComboboxGroup`, `ComboboxItem`, `ComboboxEmpty`, `ComboboxCreateNew` (`onCreateNew`, children as a render function). Needs shadcn `command`, `popover`, `cmdk`. The trigger shows the label found in `data`, so a created value must be added to `data`. Used for the model in the AI key drawer.
- **status** → `src/components/kibo-ui/status.tsx`. `Status` (`status: online | offline | maintenance | degraded`), `StatusIndicator` (a dot with a ping), `StatusLabel`. Needs shadcn `badge`. Athar change: the four dot colours read `--ok`, `--bad`, `--glaze`, `--warn`. Used by `StepStateBadge` for up to date, failed, running and out of date.

## Changed 2026-11-18

- **choicebox** was removed: the owner wanted the provider as a dropdown with each provider's own mark. The provider is now the portal's Select (`DeskSelect`) with `ProviderMark` (`src/components/athar/provider-mark.tsx`), which inlines the one-colour SVGs from `@lobehub/icons-static-svg` (Lobe Icons, MIT): openrouter, groq, openai, anthropic, google.
- **combobox**: the trigger takes children; the model trigger shows the provider's mark and the model id. The chosen row carries a check.
- shadcn `command` fix: cmdk writes `data-selected="false"` on every other row, so `data-selected:` styled all rows as selected. The classes now read `data-[selected=true]:`.
