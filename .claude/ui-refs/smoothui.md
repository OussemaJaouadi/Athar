# smoothui — AI set (pulled 2026-11-17 from https://smoothui.dev/r/<name>.json)

Install: `npx shadcn@latest add @smoothui/<name>` (or `npx smoothui-cli add <name>`). Deps: `motion`, `lucide-react`; registry deps `ai-core`, `smooth-button`.
In Athar these are vendored by hand in `src/components/smoothui/` (no smooth-button, no ai-core), re-skinned to Athar tokens.

## ai-prompt-input — https://smoothui.dev/docs/components/ai-prompt-input
Prompt composer: autogrowing textarea (1–8 rows, height from scrollHeight, layout spring), attachment chips, toolbar row, submit that swaps send ↔ stop.
Props: `aria-label`, `attachments`, `children` (left toolbar slot), `className`, `disabled`, `maxLength` (counter from 80%), `onAttach`, `onRemoveAttachment`, `onStop`, `onSubmit(value)`, `onValueChange`, `placeholder`, `state: AIState` ('idle'|'listening'|'thinking'|'streaming'|'done'|'error'; streaming → stop), `value` (controlled).
Keys: Enter submits, Shift+Enter new line. Respects reduced motion.

## ai-loader — https://smoothui.dev/docs/components/ai-loader
Waiting indicators sharing one 1.2s cycle: `variant: 'dots' | 'bar' | 'grid'`, `label`, `showElapsed`. role=status, aria-live polite. Never fakes determinate progress.

## ai-suggestions — https://smoothui.dev/docs/components/ai-suggestions
Prompt chips that stagger in from the centre of the row outwards (equal-weight alternatives). Props: `suggestions: {id,label}[]`, `onSelect`, `label`, `className`.

## Alternatives passed on
- bencho Ai Chat Input (pill → box on press, model/effort menu, mic → send): https://bencho.dev/blocks/ai-chat-input
- reactbits Prompt Bar (@ sources, / commands, model picker): https://reactbits.dev/micro/prompt-bar
- smoothui ai-orb-face / siri-orb as an AI presence mark.

## Installed whole on 2026-11-17 (home page)

Registry alias `@smoothui` (`https://smoothui.dev/r/<name>.json`). Each component lives in its own folder, `src/components/smoothui/<name>/index.tsx`, because they import each other by relative path. Their colour names (`brand`, `on-brand`, `smooth-900`, `btn-drop`, `green`, `amber`, `blue`, `destructive-*`) are mapped to Athar's tokens in the `@theme` block of `src/styles.css`, so the component files are unedited.

- **ai-prompt-input** (+ `ai-core`, `smooth-button`): `AIPromptInput` default export; `value`, `onValueChange`, `onSubmit`, `state` (`idle | thinking | streaming | done | error`), `disabled`, `placeholder`, `children` (left of the toolbar), `attachments`/`onAttach` (unused). Enter sends, Shift+Enter breaks the line.
- **ai-loader**: `AILoader` default export; `variant: dots | bar | grid`, `label`, `showElapsed`.
- **ai-suggestions**: `AISuggestions` default export; `suggestions: {id,label}[]`, `onSelect(suggestion)`, `label`.
- Not installed: `ai-sources` (a mark stack that fans into a source list) and `favicon-search`; both are candidates for the idea page and the portal's startup search.
