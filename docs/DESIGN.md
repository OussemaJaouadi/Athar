# Athar — Design System

> Foundation v0.2 — the Qallaline palette and type, November 2026. The earlier
> onyx and candy-blue baseline is reserved for another product and is withdrawn.
> Runtime behavior and accessibility still require validation on real screens.

## Authority and scope

- This document owns Athar's shared visual language and interface conventions.
- Keep confirmed decisions separate from proposed defaults when revising it.
- Preserve the approved web baseline across implementation; reopen visual choices only for an explicit change or a demonstrated issue.
- A color or component's presence does not introduce a product feature or milestone.
- Keep the system independent of the frontend framework and component library.
- Demonstration content used during design is not product data.

## Confirmed direction

- **Layout:** research workspace; results remain beside the selected profile.
- **Source of the palette:** Qallaline tiles of Tunis, the four historic glazes on white tin glaze: manganese, copper green, antimony ochre, cobalt. Cobalt is deliberately unused because blue belongs to the owner's other products.
- **Brand anchors:** manganese ink `#2A211C` and glaze green `#0F7A66`.
- **Themes:** light and dark, each designed explicitly.
- **Character:** "Athar keeps the traces: every fact about Tunisian startups, with its source beside it."
- **Evidence:** a claim leads to its original source while preserving context.
- **Proportion:** 60-30-10. The page is the 60, the glaze-neutral family is the 30, green is the single 10 and the only action color.

## Color tokens

- Values are listed as **light / dark**. Components consume role names, not raw hex values.
- Keep the brand anchors stable; use theme-specific variants for legible text and controls.
- Use explicit background colors so contrast does not depend on stacked transparency.
- Ratios below are computed WCAG contrast against the stated background.

### Surfaces and content (the 60 and the 30)

- `color.canvas`: `#F8F6F1` / `#171412` — the 60, the page itself.
- `color.surface`: `#EEEAE2` / `#211C18` — section fills, cards, tables.
- `color.surface.raised`: `#E4DFD5` / `#2B251F` — toolbars, overlays.
- `color.selection.background`: `#DCEDE6` / `#1F3A33` — a green tint; text on it keeps its own color (13.0:1 / 11.4:1).
- `color.text.primary`: `#2A211C` / `#F8F6F1` (14.6:1 / 17.0:1 on canvas).
- `color.text.secondary`: `#6B5F55` / `#A89C90` (5.7:1 / 6.8:1 on canvas; 5.2:1 / 6.3:1 on surface).
- `color.link`: `#0F7A66` on canvas, `#0D6E5C` on surface / `#6FCDB4` (4.9:1 and 5.1:1 / 9.7:1).
- `color.focus`: same as link.
- `color.border.subtle`: `#D6D0C4` / `#3A332D` — decorative dividers only.
- `color.border.control`: `#8A8076` / `#7A7066` — input outlines (3.6:1 / 3.8:1, above the 3:1 floor).

- Canvas is the workspace background; surface is the main reading or control surface.
- Selected content retains primary and secondary text; its tint communicates selection.
- Subtle separators group content; they must not be the only way to identify a control.
- Link text inside prose is underlined; color alone does not identify the link.

### Actions and focus (the 10)

- `color.action.primary.background`: `#0F7A66` / `#6FCDB4`.
- `color.action.primary.foreground`: `#FFFFFF` / `#171412` (5.3:1 / 9.7:1).
- `color.action.primary.hover`: `#0D6E5C` / `#86D8C3`.
- `color.action.primary.pressed`: `#0B6150` / `#5CBFA6`.
- Secondary actions use surface, primary text, and the control border.
- Focus uses a 2px ring with 2px separation, independent of hover or selection.
- Green is reserved for actions, links, current selection, and navigation. Nothing else is green.

### Ochre, the data accent

- `color.accent.data`: `#B07A0C` / `#E4B64A` — chart fills, the evidence marker, "sourced" and year badges; large shapes only in light (3.5:1).
- `color.accent.data.text`: `#875D08` / `#E4B64A` (5.4:1 on canvas, 4.9:1 on surface / 9.7:1).
- Ochre is never a link or a button, so green stays the only action color and the 10 holds.

### Semantic states

- Each state combines text, an icon or symbol, and a tinted background. Ratios are text on its tint.
- **Success, light:** foreground `#276A43`, background `#E6F1E9` (4.6:1).
- **Success, dark:** foreground `#7BD094`, background `#17302A` (7.6:1).
- **Warning, light:** foreground `#7A5F00`, background `#F7EDD6` (4.6:1); yellow-leaning so it never reads as copper.
- **Warning, dark:** foreground `#E0B84A`, background `#332A12` (7.5:1).
- **Error, light:** foreground `#B3261E`, background `#F7E2DF` (5.3:1).
- **Error, dark:** foreground `#F08A80`, background `#35201D` (6.3:1).
- **Information, light:** foreground `#4A6B8C`, background `#E2EAF0` (4.6:1); a muted steel, kept far from cobalt and candy blue.
- **Information, dark:** foreground `#A9BFD6`, background `#1C262E` (8.1:1).

- Success reports a completed operation; it does not certify a startup or claim.
- Warning means attention is needed; error means an operation failed or input is invalid.
- Information supplies context without implying urgency.
- Missing evidence stays neutral and is described explicitly.
- Brand selection never implies verification, confidence, or business performance.

### Charts (tesserae)

- Slot A, glaze green: light `#0F7A66`, dark `#6FCDB4`.
- Slot B, ochre: light `#B07A0C`, dark `#E4B64A`.
- Slot C, manganese: light `#5A4036`, dark `#C9A999`.
- Slot D, terracotta: light `#B5553A`, dark `#E8927B`.
- Slot E, steel: light `#4A6B8C`, dark `#A9BFD6`.
- Every light slot is at least 4.5:1 on canvas; every dark slot at least 7.7:1.
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

All families are free (Google Fonts, OFL) and cover Arabic, French and English together.

- **Display:** Readex Pro 500 and 600, variable. Built from Lexend for readability; its Latin and Arabic were designed together, with geometric, kufi-like forms that answer the tile geometry.
- **Body and tables:** IBM Plex Sans with IBM Plex Sans Arabic, 400 and 500. One family across scripts, tabular figures (`tnum`) for every table and comparison.
- **Fallback pair:** El Messiri 600 for display; Noto Sans with Noto Naskh Arabic for body.
- **Arabic running text:** Noto Naskh Arabic; **Arabic UI labels:** Noto Kufi Arabic.
- Verify Readex Pro's tabular figures before setting numbers in it; until then all numbers are Plex.
- Page title: 28px size / 36px line height. Section heading: 20px / 28px.
- Body and source excerpts: 16px / 24px. Controls and compact labels: 14px / 20px. Secondary metadata: 13px / 18px.
- Implement sizes in rem; preserve browser zoom and user text scaling.
- Keep prose approximately 65–75 characters wide; tables may be wider.
- Reserve monospace for identifiers, code, and technical output.
- Avoid tiny uppercase labels and exaggerated heading scales.
- Source excerpts retain their original language and reading direction.

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

## Interface copy

One vocabulary for the whole interface; the words below are the only names for these things.

| Term | Meaning |
|---|---|
| **Run** | One execution of an operation. |
| **Collect, Clean, Prepare** | The three operations. Status prose keeps the stem: "Collect failed", not "Collection failed". |
| **Source row** | One raw registry row as downloaded. Never "entry", "item", or "evidence" on its own. |
| **Record** | One cleaned source row; the unit of "records in review". |
| **Startup** | One matched entity. "Entity" is a table name, never interface copy. |
| **Snapshot** | One downloaded copy of the registry. |
| **In review** | A record with an open finding, which is either a **decision** or a **gap**. |
| **Finding** | One reason a record is in review. |
| **Profile** | One Groq key with its model and limits. |
| **Reset registry data** | The destructive action. "Clear" never destroys stored data. |

Rules:

- Sentence case for every label, heading, column, and button. Uppercase only on status badges.
- Buttons are verb first and name the object: "Open profile", "Reset registry data".
- Step titles and progress say what the operator asked for, never the function that runs: "Match startups and save", not "Resolve identities & commit".
- Errors read "Operation failed: cause." followed by one next step. Never "see Logs" when the cause is known.
- Code identifiers never reach the screen: no enum values, booleans, or theme names in copy.
- Every terminal status says what is kept, in the same words everywhere: "Finished work is saved" (Prepare), "Stored rows are kept" (Collect).
- No reassurance or marketing adjectives: graceful, safely, immutable, guarantee.
- The name, tagline, and version come from one module, not literals.

## Validation and decision changes

- Every text pair above was computed against its stated background; the lowest text contrast is **4.6:1** (success, warning and information on their light tints), the lowest control boundary **3.6:1**.
- Light-theme ochre `#B07A0C` fails for text (3.5:1) and is restricted to fills and large shapes; the text variant is `#875D08`.
- Light-theme green `#0F7A66` passes on canvas (4.9:1) but not on surface (4.4:1); links on surfaces use `#0D6E5C`.
- These measurements validate specified pairs, not accessibility of a rendered application.
- Target at least 4.5:1 for normal text and 3:1 for essential control boundaries and graphical information.
- During implementation, verify typography rendering, keyboard focus, narrow layouts, long content, Arabic text, and both themes.
- Check text enlargement, reduced motion, and color-vision differences on actual screens.
- Recheck changed color pairs whenever tokens or their usage change.
- Promote a proposed choice to confirmed only after its visual or interaction review.

## References

- [Readex Pro](https://fonts.google.com/specimen/Readex+Pro), [IBM Plex Sans Arabic](https://fonts.google.com/specimen/IBM+Plex+Sans+Arabic), [El Messiri](https://fonts.google.com/specimen/El+Messiri), [Noto Naskh Arabic](https://fonts.google.com/specimen/Noto+Naskh+Arabic).
- Qallaline tilework: the Tunis workshops of the 17th and 18th centuries; see the Bardo and Dar Ben Abdallah collections.
- [WCAG 2.2 — text contrast](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html).
- [WCAG 2.2 — non-text contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html).
