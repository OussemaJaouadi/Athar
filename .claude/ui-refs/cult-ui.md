# Cult UI — live reference

Pulled 2026-11-17 from https://cult-ui.com (registry: `https://cult-ui.com/r/<name>.json`, alias `@cult-ui` in `components.json`).
Identity strength 3 (see `~/.claude/ui-docs/cult-ui.md`): tactile, shader and dither accents on a shadcn base. Use it for moments, not for every control.

## Installed

### prompt-composer → `src/components/cult-ui/prompt-composer.tsx`

- Docs: https://cult-ui.com/docs/components/prompt-composer
- Install: `bunx --bun shadcn@latest add https://cult-ui.com/r/prompt-composer.json` (adds `@paper-design/shaders-react`; uses `@base-ui/react`, `motion`, `lucide-react`). The CLI writes to `src/components/ui/`; move it to `src/components/cult-ui/`.
- What it is: a multiline AI prompt field with animated gradient blobs along its lower rim, soft ambient orbs behind it, a small WebGL shader avatar that speeds up while typing and loading, a placeholder that staggers in letter by letter, a loading line that replaces the text, and a send button that crossfades into a spinner.
- Props (`PromptComposerProps`, extends textarea attributes): `value`, `onChange`, `placeholder`, `isLoading`, `loadingText`, `onSend` (Send button or Cmd/Ctrl+Enter), `onAttach` / `showAttach`, `blobTranslucent`, `autoGrow`, `maxAutoGrowPx`, `onKeyDown`.
- Athar changes, and nothing else: the rim, backdrop and shader colours are the Qallaline glazes; a `size` prop (`md` | `lg`) sets 20px text. It needs the `fine-hover` custom variant, defined in `src/styles.css`.
- Used on: the home page (`src/routes/_app/index.tsx`), where Enter asks and Shift+Enter breaks the line through `onKeyDown`.

## Worth a look next (from the catalog, not installed)

- `halo-search`: search input with an animated gradient border, staggered placeholder and loading state. Candidate for the Archive search and the portal's startup search.
- `halo-input` / `halo-field`: form fields that match the composer. Candidate for the AI key drawer.
- `texture-button`: tactile layered buttons. Candidate for the one primary action on a page.
- `dynamic-island`: a morphing status pill. Candidate for the pipeline run in flight (today Kokonut's status island).
- `family-drawer`: a drawer whose content morphs between steps.
