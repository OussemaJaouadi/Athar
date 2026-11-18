# Athar — Design System

> Foundation v0.3 — the Qallaline palette and type, corrected on 17 November 2026 to match the
> tokens in `src/styles.css` and the components in `src/components/athar/`. The earlier onyx and
> candy-blue baseline is reserved for another product and is withdrawn.
> Where this document and the code disagree, the code is what ships; fix one of them.

## Authority and scope

- This document owns Athar's shared visual language and interface conventions.
- Keep confirmed decisions separate from proposed defaults when revising it.
- Preserve the approved web baseline across implementation; reopen visual choices only for an explicit change or a demonstrated issue.
- A color or component's presence does not introduce a product feature or milestone.
- Keep the system independent of the frontend framework and component library.
- Demonstration content used during design is not product data.

## Confirmed direction

- **Layout:** research workspace; results remain beside the selected profile. The operator portal uses the same idea as a split desk: a list on the left and a permanent detail pane on the right (picked by the owner on 17 Nov 2026).
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
- `color.text.secondary` (`--ink-2`): `#6B5F55` / `#D3C9BD` (5.7:1 / 11.2:1 on canvas). Labels only; sentences use primary text.
- `color.text.tertiary` (`--ink-3`): `#6B5F55` / `#A89C90` (5.7:1 / 6.8:1 on canvas). Identifiers, timestamps and the word "empty".
- `color.link`: `#0F7A66` on canvas, `#0D6E5C` on surface / `#6FCDB4` (4.9:1 and 5.1:1 / 9.7:1).
- `color.focus`: same as link.
- `color.border.subtle` (`--hairline`): `#D6D0C4` / `#4D453D` — dividers between rows only (2.0:1 in dark, so never the edge of a control).
- `color.border.control` (`--edge`): `#8A8076` / `#8F8479` — the outline of every input, button, table and pane (3.6:1 / 5.0:1, above the 3:1 floor).

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

- A state is an icon and a word on a tinted pill. The colour is in the icon and the tint; the word stays primary text, so a state never reads by colour alone. Ratios are primary text on the tint, then the icon on the tint.
- **OK** (`--ok`, `--ok-bg`): light `#0F7A66` on `#D9ECE5` (12.8:1, icon 4.3:1); dark `#6FCDB4` on `#16302A` (13.0:1, icon 7.4:1). The glaze green doubles as the success colour.
- **Warning** (`--warn`, `--warn-bg`): light `#7A5F00` on `#F7EDD6` (13.5:1, icon 5.2:1); dark `#E0B84A` on `#332A12` (13.1:1, icon 7.5:1). Yellow-leaning so it never reads as copper.
- **Bad** (`--bad`, `--bad-bg`): light `#B3261E` on `#F7DFDC` (12.4:1, icon 5.1:1); dark `#F08A80` on `#3B1D1A` (14.1:1, icon 6.3:1).
- **Idle and busy:** the raised surface as the tint, with a secondary-text icon (idle) or a green spinning icon (busy).
- There is no separate information colour in the code today; context is said in words.

- OK reports a finished run or a step that is up to date; it does not certify a startup or claim.
- Warning means attention is needed; error means an operation failed or input is invalid.
- Information supplies context without implying urgency.
- Missing evidence stays neutral and is described explicitly.
- Brand selection never implies verification, confidence, or business performance.

### Charts (tesserae)

- Slot A, glaze green: light `#0F7A66`, dark `#6FCDB4`.
- Slot B, ochre: light `#B07A0C`, dark `#E4B64A`.
- Slot C, manganese: light `#5A4036`, dark `#B98AE0`.
- Slot D, terracotta: light `#B5553A`, dark `#EF6B4A`.
- Slot E, steel: light `#4A6B8C`, dark `#5AA2E6`.
- Every light slot is at least 4.5:1 on canvas; every dark slot at least 6.0:1. The dark values of C, D and E were made more saturated on 17 Nov 2026 because the owner could not tell the earlier pastels apart.
- The same five slots plus one of four motifs make the sector tile (`TileMark`), which stands for a startup's sector wherever a startup is listed.
- Raw JSON in the portal is the one other place with coloured text: strings ochre text, numbers `#2B5F9E` / `#7FB4EA`, null `#A13C22` / `#EF8A6E`.
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

All families are free (Google Fonts, OFL).

- **Display:** Amiri 700, with Noto Naskh Arabic and Georgia behind it. Used only for page titles, the name of the record or step in a pane, and the answer sentence. Never for labels, buttons or data.
- **Text:** Readex Pro 400 and 500. Its Latin and Arabic were designed together.
- **Identifiers:** Fragment Mono, for entry ids, slugs, urls, model ids and raw values. Not a costume for "technical".
- Reading room: page title 28px / 36px; body and source excerpts 16px / 24px; controls 14px / 20px; secondary 13px / 18px.
- Operator portal: page and pane titles 22px; text 14px; labels 13px; nothing below 13px.
- Sentences are primary text. Secondary text is for labels, column headings and qualifiers.
- Implement sizes in rem; preserve browser zoom and user text scaling.
- Keep prose approximately 65–75 characters wide; tables may be wider.
- Tabular figures wherever digits line up in a column.
- Avoid tiny uppercase labels and exaggerated heading scales.
- Source excerpts retain their original language and reading direction.

## Geometry and elevation

- Spacing scale: 4, 8, 12, 16, 24, 32, 48px.
- Use 8–12px inside compact controls, 16–24px within sections, and 24–32px between sections.
- Records, tables and panes have square corners and 1px rules. Controls are rounded: 5–6px on buttons, inputs and chips, a full pill on state badges and counts, 6–8px on menus.
- Overlays (menus, dialogs) are the only rounded containers.
- Controls are at least 40px high in the reading room and 32–36px in the operator portal, with 36px table rows; touch layouts use at least 44px.
- Let content grow when labels wrap or text is enlarged.
- Group content through spacing and surface changes; do not enclose every group in a card.
- Reserve shadows for floating layers (menus, the drawer); keep resting content flat.
- Scrollbars inside panes are thin and take the control-border colour.

## Workspace and interaction

- The web layout is approved; verify the intended behaviors below during implementation.

- Desktop: approximately 320px for results, with a flexible profile alongside.
- Below 960px, use separate results and profile views instead of compressing both columns.
- Returning to results restores filters, selection, and reading position.
- Evidence opens inside the profile near its claim; opening it preserves browsing context.
- Original excerpts remain distinguishable from cleaned text, translations, or generated explanations.
- Use semantic headings, controls, and links with visible accessible names.
- Preserve conventional browser navigation and keyboard behavior.

### The operator portal

- Three tabs with an icon each: Status, Startups, Ideas. AI keys and the raw tables are in the account menu. The Review desk is not a fourth tab: it sits under Startups, reached by a two-option switch, **Startups | Review**, in the bar of both desks. The switch carries the number of questions waiting ("Review 12"), and the Startups tab stays current while the Review desk is open.
- Every page is a desk: a page bar (title, filters, one sentence of state, the main action), then a list and a detail pane that is part of the page. No overlay for reading; the divider can be dragged.
- The selected item carries the surface fill and a 3px bar of primary text at its start edge.
- Status draws the pipeline: one round node per step with the step's own icon, joined by a line, each with a state pill. A step's Run action sits beside its title and is the green primary button only when the step needs running.
- **Review** is a desk like the others. The bar holds the switch, a Show control (To answer, Answered) and a kind filter, and says in one sentence how many questions wait, how many readings were settled by a rule or inferred, how many more depend on the answers about people, and how many the owner answered. The list is grouped by kind in the words of the question ("Same person on several startups", "Related startups", "Websites"). A row names its subject in the registry's words and carries its reason as the detail line. The pane gives the question as a sentence, the evidence as startup cards (sector, year, label month, website with what the last check found, description, founders, with a shared founder marked in ochre), then the answers as buttons, each numbered for the keyboard, one optional note, and Undo on an answered question. A question that depends on an open person question is not listed. When decisions no longer apply because the registry changed the row, the bar offers "Forget N decisions that no longer apply".
- **Status** shows the lane totals under the pipeline: one sentence (how many readings were settled by a rule, how many are inferred and shown with a qualifier, how many wait for you), one bar and three figures, each with its words and a square swatch of the same colour. A link opens the review while any question waits. With no readings the pane says "Run everything to build them". "Run everything" sits under the pipeline, with the sentence that says what it leaves out.
- **Startups** keeps what the owner knows. The pane has a Follow toggle (the F key), "Following" is one of the facts to filter by, and a section "Your notes" sits after the registry's sections: notes are added with a kind (Closed, Acquired, Renamed, Note), a sentence, an optional date and an optional web address as the source, and are said to be the owner's own and shown on the startup's public page. The bar has an Export menu: all startups or the ones followed, CSV or JSON, Download, and the citation of the registry as text and as BibTeX, each with a copy button.
- **Ideas** opens on the checks the visitor saved, with Recent as the other view; it opens on Recent only when nothing was saved.
- A pane that holds several kinds of content uses tabs with icons (Overview, Runs, How it works) rather than one long scroll.
- A record is shown as prose and icon lines first, the registry entries behind it second, raw JSON last.
- Adding something that needs a few fields (an AI key) opens a right-side drawer: fields in the order of the decision, the one action right under them, what happens next said once below.
- Dropdowns are never the browser's own. A fixed choice is a menu with a mark and a line of explanation per option; an open set (a model id) is a menu you can type into.

### The reading room

- The reading room says what is uncertain in words, in the sentence, and never in the interface's own terms. No lane name, no badge, no pill and no colour for certainty. A settled reading is a plain sentence. An inferred one carries its qualifier ("likely also written", "appears to have moved", "possibly the same venture") and one quiet mark after the sentence, an info icon in secondary text, that opens a popover with the reason. A reading the evidence does not settle says "not confirmed". A reading the owner answered reads as settled, with no mark.
- A startup's page shows the name in its standard form, with "Published as ..." and the legal form beneath it when they differ; a line of other names ("Also appears as", "in its description", "in its email address", "its initials"); and what the website shows today, as one sentence.
- **In its own words** is a quotation: the site's own title and one-line description, attributed to the address and the date they were read, set off by a rule on its start edge. It appears only for a site that still answers or has moved. A parked, for-sale or unrelated page is not quoted as the startup's own words.
- **Same founders, other ventures** lists startups tied by shared founders: the other startup, its year, one sentence of evidence and the founders in common. A tie that rests only on a founder name not confirmed as one person is kept apart, last, under the quiet heading "Same name, not confirmed as the same person", with no founders listed as in common. On a person's page the same ventures read as a timeline.
- **Notes** appear after the other sections when the owner added any, headed by a line saying they were added on this install and are not registry data. Each shows its date, its kind, its text and its source as a link.
- Home is the one place to ask: the form, then the checks saved from their page, then the wall of startups. The Archive filters by website today (answers, moved, parked or gone, silent, listed, not listed) and by ventures (founders have another venture, has another name). Landscape states in one paragraph how many pairs of startups share founders who went on to another venture, how many more share only a name, and how many other names are on file, each with a link into the Archive.

### Component coverage

- Vocabulary in the code (`src/components/athar/`): site header with icon tabs and the account menu, desk (bar, list, item, pane, section, fields, evidence table, JSON block, select, combobox), the Startups | Review switch, review pane (question, evidence cards, answers, note), lane totals, notes form, follow toggle, export menu, state pill, sector tile, record pages, charts. The reading room adds the why mark, the other-names line, the in-its-own-words quotation, venture rows, the notes block and the saved checks list.
- Define default, hover, focus, pressed, selected, disabled, loading, and error states wherever applicable.
- Disabled controls communicate unavailability through behavior and appearance, not fading alone.
- Loading preserves layout and context; show progress for long-running operations.
- Errors explain what happened and offer a relevant recovery action.
- Empty states distinguish an empty dataset from no matching results.
- Distinguish a failed source load from an absence of evidence.
- Keyboard focus must remain visible and move predictably when content opens or closes. In a desk, J/K or the arrows move the selection and / focuses search.
- Tooltips supplement labels; they do not carry essential instructions alone.
- Charts are built on TanStack Charts, never drawn by hand. On Landscape: bars with a line for growth, a bump ranking for sectors and themes, a marimekko for team size.

### Motion and boundaries

- Use 150–200ms transitions for state feedback and pane changes.
- Honor reduced motion; keep content visible without entrance animations.
- Avoid neon glow, decorative gradients, ornamental motion, and excessive enclosing cards.
- Preserve recognizable controls; expression must not obscure how an action works.

## Interface copy

One vocabulary for the whole interface; the words below are the only names for these things.

| Term | Meaning |
|---|---|
| **Download** | One download of the registry that published a different set of rows. |
| **Entry** | One distinct registry row, kept as published and named by a 12-character id. |
| **Startup** | One real company, built from one or more entries. "Entity" is never interface copy. |
| **Person** | A founder, the same across the startups that list them. |
| **Step** | One of the five parts of the pipeline: Collect, Build, Check websites, Prepare, Embed. |
| **Run** | One execution of a step or of several in a row. Status prose keeps the stem: "Collect failed". |
| **Up to date, Out of date, Never run, Needs an AI key** | The states of a step. |
| **Fact** | Something missing or doubtful in the data today, with the startups behind it. An observation, not an error. |
| **Reading** | A value or link Athar derived from the registry, with the reason. Settled by a rule, inferred, or waiting. |
| **Question** | A reading the rules could not settle, waiting for the owner. The owner answers it in the Review desk. |
| **Note** | What the owner knows about a startup, with a source. Kept beside the registry's data, never mixed in. |
| **Follow** | The owner's list of startups to keep an eye on. |
| **Website check** | Whether a startup's own website answered, with the date and the reason in words. |
| **Idea check** | An idea someone typed and the startups closest to it at that moment. |
| **Key** | One AI provider key with its model. |

Review is the desk where the owner answers the questions the rules could not settle; a question waits there until it is answered, or until the registry changes the row it rests on. Findings, records, snapshots and source rows belonged to an earlier pipeline and are no longer used.

Rules:

- Sentence case for every label, heading, column, button and state.
- Buttons are verb first and name the object: "Open profile", "Reset registry data".
- Step titles and progress say what the operator asked for, never the function that runs: "Match startups and save", not "Resolve identities & commit".
- Errors read "Operation failed: cause." followed by one next step. Never "see Logs" when the cause is known.
- Code identifiers never reach the screen: no enum values, booleans, or theme names in copy.
- No reassurance or marketing adjectives: graceful, safely, immutable, guarantee.
- The name, tagline, and version come from one module, not literals.

## Validation and decision changes

- Every pair above was computed against its stated background on 17 November 2026; the lowest text contrast is **5.7:1** (secondary text on the light canvas), the lowest state icon **4.3:1** (the green icon on its light tint, a graphic, above the 3:1 floor), the lowest control boundary **3.6:1**.
- Light-theme ochre `#B07A0C` fails for text (3.5:1) and is restricted to fills and large shapes; the text variant is `#875D08`.
- Light-theme green `#0F7A66` passes on canvas (4.9:1) but not on surface (4.4:1); links on surfaces use `#0D6E5C`.
- These measurements validate specified pairs, not accessibility of a rendered application.
- Target at least 4.5:1 for normal text and 3:1 for essential control boundaries and graphical information.
- During implementation, verify typography rendering, keyboard focus, narrow layouts, long content, Arabic text, and both themes.
- Check text enlargement, reduced motion, and color-vision differences on actual screens.
- Recheck changed color pairs whenever tokens or their usage change.
- Promote a proposed choice to confirmed only after its visual or interaction review.

## References

- [Amiri](https://fonts.google.com/specimen/Amiri), [Readex Pro](https://fonts.google.com/specimen/Readex+Pro), [Fragment Mono](https://fonts.google.com/specimen/Fragment+Mono), [Noto Naskh Arabic](https://fonts.google.com/specimen/Noto+Naskh+Arabic).
- Qallaline tilework: the Tunis workshops of the 17th and 18th centuries; see the Bardo and Dar Ben Abdallah collections.
- [WCAG 2.2 — text contrast](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html).
- [WCAG 2.2 — non-text contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html).
