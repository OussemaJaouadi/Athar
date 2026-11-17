Site: https://reui.io (pulled 2026-11-16)

# ReUI components

Pulled from the component pages. Where a page had no props table or usage sample, that is noted and the example is marked as inferred.

## Filters

- URL: https://reui.io/components/filters
- Install: `npx shadcn@latest add @reui/filters`
- Props/API: not on the page. Page links 12 example variants (View code) and the Markdown reference at `https://reui.io/components/filters.md`, and points to the MCP call `get_component("filters")`.
- Usage: none on the page.
- Dependencies: @tanstack/react-table, nuqs (URL param persistence), zod, date-fns, react-day-picker, input-otp (one example), shadcn primitives Dropdown Menu, Popover, Calendar, Badge, Button, ScrollArea.

## Resizable

- URL: https://reui.io/components/resizable
- Install: `npx shadcn@latest add resizable`
- Built on react-resizable-panels (v4).

| Part | Option | Description |
|---|---|---|
| ResizablePanelGroup | `orientation` | `"horizontal"` side by side, `"vertical"` stacked |
| ResizablePanelGroup | `onLayout` | Layout-change callback, used to save sizes |
| ResizablePanelGroup | `defaultSizes` | Restores saved sizes on mount |
| ResizablePanel | `defaultSize` | Number = pixels, string such as `"30%"` = share of group |
| ResizablePanel | `minSize` / `maxSize` | Size limits |
| ResizablePanel | `collapse()` / `expand()` | Methods on a panel ref |
| ResizableHandle | `className` | Divider styling |

- Usage (inferred from the names; the page has no code sample):

```tsx
<ResizablePanelGroup orientation="horizontal">
  <ResizablePanel defaultSize="30%" minSize="20%">Sidebar</ResizablePanel>
  <ResizableHandle />
  <ResizablePanel defaultSize="70%">Content</ResizablePanel>
</ResizablePanelGroup>
```

- Panels and handles must be direct children of the group, with no wrapping div.
- Dependencies: react-resizable-panels (v4).

## Timeline

- URL: https://reui.io/components/timeline
- Install: `npx shadcn@latest add @reui/timeline`
- Props/API (from page text, no full table):

| Name | Details |
|---|---|
| `Timeline` | Root. Vertical or horizontal orientation. |
| `TimelineItem` | Direct child of `Timeline`. Takes `step` (number). Gets `data-completed` when done. |
| `TimelineSeparator` | Connecting line, hidden on the last item. Wrapping a `TimelineItem` in another element hides it. |
| `value` | Drives progress. No part changes the step on click or key, so pass a new value to move steps. |
| `onValueChange` | Per the page, never fires. |
| `defaultValue` | Defaults to `1`. Pass `0` when nothing is done yet. |

- Usage: none on the page. Docs at `/docs/components/base/timeline`, Markdown at `https://reui.io/components/timeline.md`.
- Dependencies: shadcn Avatar, Badge, Collapsible, Frame, Spinner; plus Base UI v1 or Radix UI v1, depending on the flavor installed.

## Table

- URL: https://reui.io/components/table
- Install: `npx shadcn@latest add table`
- Props/API: none documented. Notes only:
  - `Table` wraps the table in an overflow-x-auto div; `className` applies to the inner table, not the scroll wrapper.
  - `TableCell` and `TableHead` are nowrap in every style, so long values scroll sideways.
- Usage: none on the page.
- Dependencies: TanStack Table. The page says "react-table v9" in one place and "V8" in its features list, and does not say which to install. Radix UI and the shadcn Create style are mentioned as compatible, not listed as dependencies.

## Added 2026-11-17 (operator portal)

Primitives come from `https://reui.io/r/styles/radix-nova/<name>.json` into `src/components/reui/`; their `from "cn"` import must become `@/lib/utils`. Example variants (`c-<family>-<n>`) are compositions to copy the structure from; their `IconPlaceholder` is replaced by the lucide icon it names.

- **stepper** (primitive) → `Stepper` (`value`, `onValueChange`, `orientation`, `indicators?`), `StepperNav`, `StepperItem` (`step`, `completed`, `loading`), `StepperTrigger` (`asChild`), `StepperIndicator` (children used when no `indicators` map), `StepperTitle`. Pattern followed: **c-stepper-41**, a vertical list with a status glyph per row. Used for the five pipeline steps on Status; `completed` is set per step from its real state, not from its position.
- **frame** (primitive) → `Frame` (`variant`, `spacing`), `FramePanel`. Lends the stepper rows their radius and padding, as in c-stepper-41.
- **alert** (primitive) → `Alert` (`variant: default | destructive | info | success | warning | invert`), `AlertTitle`, `AlertDescription`. Pattern **c-alert-4** for a failed key test.
- **c-sheet-2** (pattern): a form in a Sheet with header, `FieldGroup` body and footer actions. Followed for the AI key drawer.
- **c-input-group-35** (pattern): password input with a visibility toggle in an `InputGroup`. Followed for the key field.
