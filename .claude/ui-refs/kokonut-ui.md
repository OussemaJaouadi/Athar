# Kokonut UI — components used in Athar

Pulled 2026-11-16 from the live registry (`https://kokonutui.com/r/<name>.json`, source copied into
`src/components/kokonutui/`). Install: `bunx shadcn@latest add @kokonutui/<name>` (registry is set in
`components.json`). Colours: the components use Tailwind `zinc`/`emerald`/`rose`; `src/styles.css`
remaps those to the Qallaline ramp, so do not edit vendor files to recolour them.

| Component | Where in Athar | API |
|---|---|---|
| Status Island (`status-island`) | Operator portal header: the run in flight | `<StatusIsland tasks={IslandTask[]} onDismiss? dismissAfter? />`; `IslandTask = { id, label, detail?, status: 'running'\|'done'\|'error', progress?: 0–1, action?: { label, onClick } }` |
| Marker Text (`marker-text`) | Profile: the archivist's marks on missing evidence | `<MarkerText show? gap? onDrawn? as?>…<Mark type="highlight\|underline\|circle\|box\|strike" color? strokeWidth?>…</Mark></MarkerText>` |
| Promise Toast (`promise-toast`) | Portal: starting a run | `const toaster = usePromiseToast(); toaster.show(task, { loading, waiting?, success, error, undo? })`; render `<Toaster toaster={toaster} />` once |
| Command Palette (`action-search-bar`) | Reading room header: jump to any startup | `<ActionSearchBar items={CommandItem[]} onSelect={(item, path) => …} placeholder? label? shortcut? />`; `CommandItem = { id, label, icon?, group?, keywords?, href?, children? }` |

Considered and kept for later: AI Inline Citations (`ai-citations`, idea check answers with a source
chip per claim), AI State Loading (`ai-loading`), Split Flap Text (`split-flap-text`, run status),
Uptime Card (`uptime-card`, website check history), Boarding Pass (`boarding-pass`, R2 diffs).

## Marker Text

- URL: https://kokonutui.com/docs/texts/marker-text
- Install: `npx shadcn@latest add @kokonutui/marker-text`
- Props:

| Component | Prop | Type | Default | Description |
|---|---|---|---|---|
| `MarkerText` | `children` | `ReactNode` | | Content containing `Mark` elements |
| `MarkerText` | `show` | `boolean` | | Controlled: `true` draws, `false` hides. Omit to draw once when mostly visible |
| `MarkerText` | `gap` | `number` | `140` | ms between one mark finishing and the next starting |
| `MarkerText` | `onDrawn` | `() => void` | | Called after the last mark finishes |
| `MarkerText` | `as` | `ElementType` | `"div"` | Root tag |
| `MarkerText` | `className` | `string` | | Root classes |
| `Mark` | `children` | `ReactNode` | | Phrase to mark |
| `Mark` | `type` | `"highlight" \| "underline" \| "circle" \| "box" \| "strike"` | `"highlight"` | Marking style |
| `Mark` | `color` | `string` | per type | Any CSS color |
| `Mark` | `strokeWidth` | `number` | scaled to font size | Pen width in px |
| `Mark` | `className` | `string` | | Mark element classes |

  The docs page's props table lists only `className`; the rest come from the source.

- Usage (the page's import path is an assumption; adjust to where shadcn installed it):

```tsx
import { Mark, MarkerText } from "@/components/ui/marker-text";

export function Example() {
  return (
    <MarkerText>
      <p>
        Notes that keep up with <Mark>how fast you think</Mark>, and search opens in{" "}
        <Mark type="circle">under a second</Mark>.
      </p>
    </MarkerText>
  );
}
```

- Dependencies: `react`, `lucide-react` (`RotateCcw`, demo only), a `cn` helper at `@/lib/utils`, Tailwind CSS.
