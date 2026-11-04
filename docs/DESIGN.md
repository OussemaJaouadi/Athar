# Athar — Design System

> Foundation v0.1 — approved web design baseline following the user's Stitch
> preview review. Use the specified visual system for the first implementation.
> Runtime behavior and accessibility still require validation; the Textual
> adaptation remains proposed until reviewed in the terminal.

## Authority and scope

- This document owns Athar's shared visual language and interface conventions.
- Keep confirmed decisions separate from proposed defaults when revising it.
- Preserve the approved web baseline across implementation; reopen visual choices only for an explicit change or a demonstrated issue.
- A color or component's presence does not introduce a product feature or milestone.
- Keep the system independent of the frontend framework and component library.
- Web and Textual share semantic roles and emphasis; each uses its native layout.
- Demonstration content used during design is not product data.

## Confirmed direction

- **Layout:** research workspace; results remain beside the selected profile.
- **Brand anchors:** onyx `#020202` and candy blue `#82D5E5`.
- **Themes:** light and dark, each designed explicitly.
- **Character:** cool, clear, approachable, comfortable for extended research.
- **Evidence:** a claim leads to its original source while preserving context.

## Color tokens

- Values are listed as **light / dark**. Components consume role names, not raw hex values.
- Keep the brand anchors stable; use theme-specific variants for legible text and controls.
- Use explicit background colors so contrast does not depend on stacked transparency.

### Surfaces and content

- `color.canvas`: `#F2F7F8` / `#020202`.
- `color.surface`: `#FFFFFF` / `#0E1417`.
- `color.surface.raised`: `#EAF1F3` / `#182226`.
- `color.selection.background`: `#DDF2F6` / `#16333B`.
- `color.text.primary`: `#10191C` / `#EEF5F6`.
- `color.text.secondary`: `#526368` / `#A7B9BE`.
- `color.link`: `#176579` / `#82D5E5`.
- `color.focus`: `#176579` / `#82D5E5`.
- `color.border.subtle`: `#D2DEE1` / `#2B393E`.
- `color.border.control`: `#758A90` / `#60767E`.

- Canvas is the workspace background; surface is the main reading or control surface.
- Raised surfaces separate toolbars, secondary regions, and floating content.
- Selected content retains primary and secondary text; its tint communicates selection.
- Subtle separators group content; they must not be the only way to identify a control.
- Use the control border for input outlines and other essential visible boundaries.
- Link text inside prose is underlined; color alone does not identify the link.

### Actions and focus

- `color.action.primary.background`: `#82D5E5` in both themes.
- `color.action.primary.foreground`: `#071215` in both themes.
- `color.action.primary.hover`: `#9CE0EC` in both themes.
- `color.action.primary.pressed`: `#67C3D7` in both themes.
- Light-mode primary buttons retain a visible control outline.
- Secondary actions use surface, primary text, and the control border.
- Focus uses a 2px ring with 2px separation, independent of hover or selection.
- Hover gives temporary feedback; selection remains visible after the pointer leaves.
- Reserve strong candy-blue emphasis for actions, current selection, and navigation.
- Do not turn ordinary descriptions or source text blue for decoration.

### Semantic states

- Each state combines text, an icon or symbol, and a tinted background.
- **Success, light:** foreground `#176344`, background `#E7F4EC`.
- **Success, dark:** foreground `#80CFA6`, background `#102A20`.
- **Warning, light:** foreground `#7A4B08`, background `#FFF1D6`.
- **Warning, dark:** foreground `#F1C276`, background `#302414`.
- **Error, light:** foreground `#A13635`, background `#FCEDEC`.
- **Error, dark:** foreground `#F2A09A`, background `#311D1D`.
- **Information, light:** foreground `#275E91`, background `#E9F2FA`.
- **Information, dark:** foreground `#9BC7F2`, background `#172838`.

- Success reports a completed operation; it does not certify a startup or claim.
- Warning means attention is needed; error means an operation failed or input is invalid.
- Information supplies context without implying urgency.
- Missing evidence stays neutral and is described explicitly.
- Brand selection never implies verification, confidence, or business performance.

### Charts

- Category A: light `#23798C`, dark `#82D5E5`.
- Category B: light `#26764F`, dark `#83CEA3`.
- Category C: light `#8256A6`, dark `#C5AAED`.
- Category D: light `#946307`, dark `#E6BE74`.
- Category E: light `#B55367`, dark `#EEA4B5`.
- A–E are palette slots, not product categories or rankings.
- Preserve category-to-slot assignments across filters, views, and theme changes.
- Add labels; use distinguishable markers, line styles, or patterns where needed.
- A quantitative magnitude uses a sequential scale, not the categorical palette.
- Derive and validate a sequential ramp for its actual chart before using it.
- More than five categories require another encoding or a validated extension; do not silently repeat colors.
- Chart meaning must remain available through labels and underlying records.

### Theme behavior

- Follow the system preference initially; remember an explicit light/dark override.
- Keep roles and meanings stable across themes; do not mechanically invert colors.
- Check hover, selected content, overlays, and semantic backgrounds in both themes.
- A theme change preserves filters, selection, reading position, and active work.

## Typography

- **Web family:** Figtree, self-hosted; system sans-serif fallback while it loads.
- Its friendly geometric forms soften the onyx/candy-blue palette.
- Weights: 400 for reading, 500 for controls, 600 for headings.
- Page title: 28px size / 36px line height.
- Section heading: 20px / 28px.
- Body and source excerpts: 16px / 24px.
- Controls and compact labels: 14px / 20px.
- Secondary metadata: 13px / 18px.
- Implement sizes in rem; preserve browser zoom and user text scaling.
- Keep prose approximately 65–75 characters wide; tables may be wider.
- Use tabular figures for numeric comparisons.
- Reserve monospace for identifiers, code, and technical output.
- Avoid tiny uppercase labels and exaggerated heading scales.
- Source excerpts retain their original language and reading direction, with suitable font fallbacks.
- Figtree belongs to the approved web baseline following the Stitch preview review.

## Geometry and elevation

- Spacing scale: 4, 8, 12, 16, 24, 32, 48px.
- Use 8–12px inside compact controls, 16–24px within sections, and 24–32px between sections.
- Chip radius: 6px; control radius: 10px.
- Content-section radius: 12px; overlay radius: 16px.
- Standard controls are at least 40px high; touch layouts use at least 44px.
- Let content grow when labels wrap or text is enlarged.
- Group content through spacing and surface changes; do not enclose every group in a card.
- Reserve shadows for floating layers; keep resting content flat.

## Workspace and interaction

- The web layout is approved; verify the intended behaviors below during implementation.

- Desktop: approximately 320px for results, with a flexible profile alongside.
- Below 960px, use separate results and profile views instead of compressing both columns.
- Returning to results restores filters, selection, and reading position.
- Evidence opens inside the profile near its claim; opening it preserves browsing context.
- Original excerpts remain distinguishable from cleaned text, translations, or generated explanations.
- Use semantic headings, controls, and links with visible accessible names.
- Preserve conventional browser navigation and keyboard behavior.

### Component coverage

- Initial vocabulary: navigation, search, filters, result rows, profile sections, evidence disclosure, buttons, inputs, status messages, and charts.
- Define default, hover, focus, pressed, selected, disabled, loading, and error states wherever applicable.
- Disabled controls communicate unavailability through behavior and appearance, not fading alone.
- Loading preserves layout and context; show progress for long-running operations.
- Errors explain what happened and offer a relevant recovery action.
- Empty states distinguish an empty dataset from no matching results.
- Distinguish a failed source load from an absence of evidence.
- Keyboard focus must remain visible and move predictably when content opens or closes.
- Tooltips supplement labels; they do not carry essential instructions alone.

### Motion and boundaries

- Use 150–200ms transitions for state feedback and pane changes.
- Honor reduced motion; keep content visible without entrance animations.
- Avoid neon glow, decorative gradients, ornamental motion, and excessive enclosing cards.
- Preserve recognizable controls; expression must not obscure how an action works.

## Terminal components

The terminal interface is built from this vocabulary and nothing else. A pane that needs something new extends the vocabulary here first.

| Component | Rule |
|---|---|
| Pane | No outer frame. Padding `1 1 0 1`. Columns separate by a two-cell gap, and a detail column carries a single left rule. |
| Section label | Bold muted text with one row above it. Uppercase only for list headings such as RUNS. |
| Button | One row, `[ label ]` with two cells of padding, no border. Primary is the candy fill; secondary is the panel tint; quota-spending is information text on its tint; destructive is error text on its tint and fills only on hover or focus. Focus underlines the label. |
| Input, select, text area | One row on the panel tint; focus moves to the selection tint. No borders. |
| List row | One line, left padded; the highlighted row takes the selection tint and, when the list has focus, a thick left bar in the accent. |
| Status chip | One row of text on the state's tint: success, warning, error, or neutral. Never bordered. |
| Key-value | Two unboxed columns: muted bold label, text value, values fold. |
| Disclosure | A Collapsible with no frame; the title is the accent and the contents indent by two cells. |
| Timeline | Five rows: markers, road, step names, state chips sized to their word, badges. |
| Log stream | The shared `render_entry` format; no frame; the title is a muted line above it. |
| Dialog | The one place a rounded frame appears, in the dialog's semantic color: line for help and about, destructive red for wipe and reset, information blue for Prepare. |

Under 100 columns the Run tab turns its operations into one row of buttons and gives the run the rest of the height; rails narrow; the Settings identity card and the Database drawer hide or take the full width.

## Interface copy

One vocabulary for the whole interface; the words below are the only names for these things.

| Term | Meaning |
|---|---|
| **Run** | One execution of an operation; also the tab that starts one. |
| **Collect, Clean, Prepare** | The three operations. Status prose keeps the stem: "Collect failed", not "Collection failed". |
| **Source row** | One raw registry row as downloaded. Never "entry", "item", or "evidence" on its own. |
| **Record** | One cleaned source row; the unit of "records in review". |
| **Startup** | One matched entity. "Entity" appears only in the Database tab, where it is a table name. |
| **Snapshot** | One downloaded copy of the registry. |
| **In review** | A record with an open finding, which is either a **decision** or a **gap**. |
| **Finding** | One reason a record is in review. |
| **Profile** | One Groq key with its model and limits. |
| **Reset registry data**, **Wipe all data** | The two destructive actions. "Clear" never destroys stored data. |

Rules:

- Sentence case for every label, heading, column, and button. Uppercase only on status badges and section labels.
- Buttons are verb first and name the object: "Open Records", "Reset registry data". Key hints share one format: "Prev (p)".
- Step titles and progress say what the operator asked for, never the function that runs: "Match startups and save", not "Resolve identities & commit".
- Errors read "Operation failed: cause." followed by one next step. Never "see Logs" when the cause is known.
- Code identifiers never reach a widget: no enum values, booleans, or theme names in copy.
- Every terminal status says what is kept, in the same words everywhere: "Finished work is saved" (Prepare), "Stored rows are kept" (Collect).
- No reassurance or marketing adjectives: graceful, safely, immutable, guarantee.
- The name, tagline, and version come from one module (`identity.py`), not literals.

## Textual adaptation — proposed

- Share semantic color names, selection emphasis, and status wording with the web interface.
- Keep the terminal's font; adapt spacing to cells and geometry to terminal capabilities.
- Use visible focus outlines or markers; distinguish focus from selected content.
- Arrow keys navigate choices; Enter activates; Escape returns or dismisses where safe.
- Text inputs retain native editing behavior.
- Navigation alone never launches a DataOps operation.
- Represent execution, progress, completion, and errors using both labels and symbols.
- Preserve meaning when terminal colors are approximated or overridden.
- Maintain responsive interaction during long-running work.

### Terminal tokens

The terminal keeps the web roles and the two brand anchors, with values tuned for cells. Every pair below is checked by `tests/unit/test_themes.py`.

| Role | Dark | Light | Use |
|---|---|---|---|
| canvas | `#020202` | `#E6EAEC` | workspace background |
| surface | `#0F171A` | `#FFFFFF` | reading and control surface |
| panel | `#1E2A2F` | `#F2F4F5` | inset blocks, secondary buttons |
| hover | `#323C42` | `#E8EDEF` | temporary pointer feedback, a neutral lift |
| selection | `#124552` | `#B9E3EB` | the current item, a teal tint |
| text | `#EEF5F6` | `#1C1D1F` | primary text |
| muted | `#A3B6BC` | `#555B5F` | secondary text, 4.5:1 or better on every surface |
| line | `#36484F` | `#C3CCD0` | separators that group content |
| control-line | `#7A929B` | `#6C7B82` | borders of inputs and secondary buttons |
| accent | `#82D5E5` | `#075E73` | focus ring, links, selection text, primary fill (light fill `#0A6D82` with white) |
| information | `#9BC7F2` on `#172838` | `#275E91` on `#E9F2FA` | text on its tint only: source gaps, the quota-spending action outline |
| success | `#8FDCB2` on `#102A20` | `#176344` on `#E7F4EC` | a completed operation |
| warning | `#F1C276` on `#302414` | `#7A4B08` on `#FFF1D6` | attention: warnings, cancelled, a finding that needs a decision |
| error | `#E8837B` on `#311D1D` | `#C02A54` on `#FCEDEC` | a failed operation or invalid input |
| destructive | `#B3453D` with `#EEF5F6` | `#C02A54` with white | Reset registry data and Wipe all data only |
| violet | `#C5AAED` | `#68429A` | JSON numbers and booleans, a syntax role |

- Hover and selection are different colors in both themes; focus adds a ring in the accent, and a focused primary button gets a ring in its own text color.
- Surfaces separate on their own (1.2:1 dark, 1.1:1 light); borders group content and are not the only way to see a region.
- Information is never a fill: the Prepare actions are outlined in it so the primary action stays the one filled candy blue control.
- Amber means attention. Destructive actions are red. Running is the accent. A card never carries a colored stripe for decoration.
- No pane or widget holds a color literal; the themes module is the only source, and the shared theme helper picks the palette.
- Keep the accepted seven-tab primary layout, bordered panels, and terminal typography.
- Keep Logs and Probes as normal primary tabs with consistent focus, empty, error, and loading states.
- Keep the masthead operational: show active operation state, completion, cancellation, or failure before the user opens a detail view.
- Rich JSON, tables, stage progress, and logs read theme colors explicitly; secondary text avoids ANSI dimming.
- JSON keys render in the accent, strings in the text color, numbers and booleans in violet, null in muted italic, in both themes.
- Records search covers names, sectors, and descriptions across the latest completed collection.
- Use an explicit `block-hover-background` in the TUI: Textual's generated `boost` resolves to transparent in light mode.
- Light-mode states are explicit in Records, Database, Logs, and Settings, including dropdowns and the tab bar. Active navigation and filter fills are the accent; row selections use the selection tint. Keyboard focus adds a ring or underline, without implicit framework tinting.
- No matches keeps search available and clears previous record details.
- At fewer than 120 terminal columns, Database opens row details on Enter; Escape restores the table and selected row.
- The collection card reports the last run outcome, with Unknown on read failure. No static health claim.

## Validation and decision changes

- The foundation's 51 sampled color pairings passed the checks below.
- Lowest sampled text contrast: **5.42:1**; lowest checked control/chart contrast: **3.17:1**.
- Primary button text on candy blue: **11.39:1**.
- Samples cover primary/secondary/link text on four surfaces per theme, control borders on three surfaces, chart marks on content surfaces, semantic text on its tint, and three primary-button states.
- These measurements validate specified pairs, not accessibility of a rendered application.
- Target at least 4.5:1 for normal text and 3:1 for essential control boundaries and graphical information.
- During implementation, verify typography rendering, keyboard focus, narrow layouts, long content, and both themes against the approved baseline.
- Check text enlargement, reduced motion, and color-vision differences on actual screens.
- Recheck changed color pairs whenever tokens or their usage change.
- Promote a proposed choice to confirmed only after its visual or interaction review.
- Visual approval does not replace runtime testing or accessibility verification.

## References

- [Figtree — official font repository](https://github.com/erikdkennedy/figtree).
- [WCAG 2.2 — text contrast](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html).
- [WCAG 2.2 — non-text contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html).
