# Interior — components used in Athar

Pulled 2026-11-16 from `https://www.interior.dev/r/<name>.json`, source in `src/components/interior/`.
Install: `bunx shadcn@latest add @interior/<name>`. Each component is a headless `useX` hook plus a
styled example; Motion is the only dependency.

| Component | Where in Athar | API |
|---|---|---|
| Value Flash (`value-flash`) | Lab: run step counts announce a change, then go quiet | `<ValueFlash value={number} format? label? hold? announceAfter? />`, or `useValueFlash(value, { hold?, compare? })` |
| Hold to Confirm (`hold-to-confirm`) | Lab → Keys: removing a key | `<HoldToConfirm onConfirm confirmLabel? duration? resetAfter? disabled?>label</HoldToConfirm>`, or `useHoldToConfirm({ onConfirm, duration? })` |

Considered: New Items Pill (`new-items-pill`, for a live run log), Copy Button (`copy-button`, ids and hashes).

Docs pulled 2026-11-16 from https://www.interior.dev/docs/<name>. Each install command below is copied from its docs page; it differs from the `@interior/<name>` form in the header above.

## Segmented Control

- URL: https://www.interior.dev/docs/segmented-control
- Install: `bunx shadcn@latest add https://www.interior.dev/r/segmented-control.json`
- Props:

| Prop | Type | Default | Description |
|---|---|---|---|
| `options` | `SegmentedOption[]` | required | `{ value, label, disabled? }`; equal-width segments |
| `label` | `string` | required | Accessible name of the radiogroup |
| `value` | `string \| undefined` | `undefined` | Controlled selection, use with `onValueChange` |
| `defaultValue` | `string \| undefined` | `options[0].value` | Uncontrolled start |
| `onValueChange` | `(value: string) => void` | `undefined` | Fires only on change |
| `className` | `string` | `""` | Appended to the track |

- Usage:

```tsx
"use client";
import { useState } from "react";
import { SegmentedControl } from "@/components/interior/segmented-control";

const OPTIONS = [
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
];

export function Range() {
  const [range, setRange] = useState("day");
  return (
    <SegmentedControl label="Date range" options={OPTIONS} value={range} onValueChange={setRange} />
  );
}
```

- Dependencies: `motion` (`bun add motion`), React, Tailwind CSS.

## Filter Grid

- URL: https://www.interior.dev/docs/filter-grid
- Install: `bunx shadcn@latest add https://www.interior.dev/r/filter-grid.json`
- Props:

| Prop | Type | Default | Description |
|---|---|---|---|
| `items` | `readonly T[]` | required | Full unfiltered set; its length sets reserved height, keep it stable across filters |
| `filters` | `readonly FilterDefinition<T>[]` | required | `{ id, label, match }`; include an "all" entry, first entry is fallback |
| `getKey` | `(item: T) => string` | required | Stable identity; changing keys remount instead of move |
| `renderItem` | `(item: T) => ReactNode` | required | Cell contents only; component supplies card styling and row height |
| `label` | `string` | required | Accessible name of the filter radiogroup |
| `value` | `string \| undefined` | `undefined` | Controlled active filter id |
| `defaultValue` | `string \| undefined` | `filters[0].id` | Uncontrolled start |
| `onValueChange` | `((id: string) => void) \| undefined` | `undefined` | Fires only on actual change |
| `columns` | `number` | `3` | Fixed column count |
| `rowHeight` | `number` | `72` | px |
| `maxRows` | `number` | `4` | Rows before internal scroll |
| `gap` | `number` | `8` | px |
| `emptyLabel` | `string` | `"Nothing matches this filter"` | Empty-state text |
| `className` | `string` | `""` | Outer wrapper |

- Usage:

```tsx
"use client";
import { useState } from "react";
import { FilterGrid, type FilterDefinition } from "@/components/interior/filter-grid";

type Asset = { id: string; name: string; kind: "image" | "doc" };

const FILTERS: FilterDefinition<Asset>[] = [
  { id: "all", label: "All", match: () => true },
  { id: "image", label: "Images", match: (a) => a.kind === "image" },
  { id: "doc", label: "Docs", match: (a) => a.kind === "doc" },
];

export function Assets({ assets }: { assets: Asset[] }) {
  const [kind, setKind] = useState("all");
  return (
    <FilterGrid
      label="Asset type"
      items={assets}
      filters={FILTERS}
      value={kind}
      onValueChange={setKind}
      getKey={(a) => a.id}
      renderItem={(a) => <p className="truncate text-[12.5px]">{a.name}</p>}
    />
  );
}
```

- Dependencies: `motion` (`bun add motion`, imported from `motion/react`), React, Tailwind CSS.

## Load More

- URL: https://www.interior.dev/docs/load-more
- Install: `bunx shadcn@latest add https://www.interior.dev/r/load-more.json`
- Props:

| Prop | Type | Default | Description |
|---|---|---|---|
| `onLoad` | `() => unknown` | required | Fetches next page. Resolving `false` ends the feed; rejecting shows retry |
| `hasMore` | `boolean` | `true` | `false` ends the feed; `true` reopens it |
| `auto` | `boolean` | `true` | `false` renders only a plain button, no observer |
| `rootRef` | `RefObject<Element \| null>` | `undefined` | Scroll container, when the list does not scroll the document |
| `rootMargin` | `string` | `"600px 0px"` | How early before the footer to request the next page |
| `maxAutoLoads` | `number` | `3` | Auto loads while sentinel stays visible; resets when it leaves view |
| `labels` | `Partial<Record<"idle" \| "loading" \| "error" \| "end", string>>` | `undefined` | Status copy overrides |
| `onError` | `(error: unknown) => void` | `undefined` | Receives rejections |
| `className` | `string` | `""` | Footer wrapper |

  The docs page also lists `steps` (8) and `expected` (900) for a progress meter; they are not in the source props type, so they may be from another version.

- Usage:

```tsx
"use client";
import { useRef, useState } from "react";
import { LoadMore } from "@/components/interior/load-more";

export function Feed() {
  const scroller = useRef<HTMLDivElement>(null);
  const [items, setItems] = useState<string[]>([]);

  async function loadPage() {
    const res = await fetch(`/api/items?offset=${items.length}`);
    const page: { items: string[]; hasNext: boolean } = await res.json();
    setItems((prev) => [...prev, ...page.items]);
    return page.hasNext;
  }

  return (
    <div ref={scroller} className="h-[640px] overflow-y-auto">
      {items.map((item) => <div key={item}>{item}</div>)}
      <LoadMore onLoad={loadPage} rootRef={scroller} />
    </div>
  );
}
```

- Dependencies: `motion` (`bun add motion`, from `motion/react`), React, Tailwind CSS (implied by class names), shadcn CLI.

## Show More

- URL: https://www.interior.dev/docs/show-more
- Install: `bunx shadcn@latest add https://www.interior.dev/r/show-more.json`
- Props:

| Prop | Type | Default | Description |
|---|---|---|---|
| `children` | `React.ReactNode` | | Content to clamp; laid out once at full width |
| `lines` | `number` | `3` | Collapsed height in lines |
| `maxHeight` | `number` | `320` | Max expanded height in px; taller content scrolls |
| `expanded` | `boolean` | | Controlled open state |
| `defaultExpanded` | `boolean` | `false` | Uncontrolled start |
| `onExpandedChange` | `(expanded: boolean) => void` | | Every toggle |
| `moreLabel` | `string` | `"Show more"` | Collapsed trigger label |
| `lessLabel` | `string` | `"Show less"` | Expanded trigger label |
| `label` | `string` | `"Details"` | Region name when it becomes a scroll container |
| `className` | `string` | `""` | Outer element |

- Usage:

```tsx
"use client";
import { ShowMore } from "@/components/interior/show-more";

export function Notes({ text }: { text: string }) {
  return (
    <ShowMore lines={2}>
      <p>{text}</p>
    </ShowMore>
  );
}
```

- Dependencies: `motion` (`bun add motion`), React, shadcn CLI, Tailwind CSS.

## Copy Button

- URL: https://www.interior.dev/docs/copy-button
- Install: `bunx shadcn@latest add https://www.interior.dev/r/copy-button.json`
- Props:

| Prop | Type | Default | Description |
|---|---|---|---|
| `value` | `string` | required | Text written to clipboard; empty string does nothing |
| `label` | `string` | `"Copy"` | Resting label and fixed accessible name |
| `copiedLabel` | `string` | `"Copied"` | Shown after success |
| `errorLabel` | `string` | `"Failed"` | Shown when all copy methods fail |
| `timeout` | `number` | `2000` | ms before reverting |
| `onCopy` | `(value: string) => void` | none | After successful write |
| `onError` | `(reason: unknown) => void` | none | When every method fails |
| `disabled` | `boolean` | `false` | Blocks copy and press effect |
| `className` | `string` | `""` | Button classes |

- Usage:

```tsx
import { CopyButton } from "@/components/interior/copy-button";

export function Example({ token }: { token: string }) {
  return <CopyButton value={token} />;
}
```

- Dependencies: `motion` (`bun add motion`), React, Tailwind CSS.

## Value Flash

- URL: https://www.interior.dev/docs/value-flash
- Install: `bunx shadcn@latest add https://www.interior.dev/r/value-flash.json`
- Props:

| Prop | Type | Default | Description |
|---|---|---|---|
| `value` | `number` | required | Watched number; a change triggers the flash |
| `format` | `(value: number) => string` | `String(value)` | Displayed text formatter |
| `label` | `string` | none | Prefix for the screen-reader announcement |
| `hold` | `number` | `900` | ms the tint and direction mark stay visible |
| `announceAfter` | `number` | `700` | Quiet ms before the settled value is announced |
| `className` | `string` | `""` | Root element |

- Usage:

```tsx
"use client";
import { ValueFlash } from "@/components/interior/value-flash";

export function Requests({ rps }: { rps: number }) {
  return <ValueFlash value={rps} label="Requests per second" />;
}
```

- Also exports `useValueFlash` (returns `direction`, `flashing`, and others) for custom rendering.
- Dependencies: `motion` (`bun add motion`). The file is copied into the project.

## Added 2026-11-17

Install: `bunx --bun shadcn@latest add @interior/<name> --yes`.

- **loading-button** → `LoadingButton` (`onAction` returning a promise, `children` as the idle label, `pendingLabel`, `successLabel`, `errorLabel`, `resetAfter`, `disabled`, `className`). A rejected promise shows the error label. Used for "Test and save" in the AI key drawer.
- **tabs** → `Tabs` (`items: {value,label}[]`, `value`, `onValueChange`, `label`, `renderPanel?`, `className`); one underline that travels between tabs. Used in the Status step pane (Overview, Runs, How it works).
- **progress-bar** → `ProgressBar` (`value: number | null`, `max`, `label`, `pendingLabel`, `completeLabel`); `null` is an indeterminate sweep that hands over to a fraction. Used under "Where it stands" on Status.

## Changed 2026-11-18

- **pagination** → the Archive now uses the whole `Pagination` component (`count`, `page`, `onPageChange`, `siblings`, `boundaries`, `label`), not only its `paginate` helper with hand-written buttons.
- **tabs** was removed: in the Status step pane its tab row vanished after switching tabs. The pane uses shadcn `Tabs` with `TabsList variant="line"` (`src/components/ui/tabs.tsx`) instead.
