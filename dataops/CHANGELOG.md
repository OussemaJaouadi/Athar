# DataOps changelog

## Unreleased

### Collection and data quality

- Resolved false identity reviews from shared website hosts: Facebook and Google Sites pages now use their page paths, and a new site creates a separate entity without a manual merge decision.
- Suppress only content-equivalent duplicate rows. Different descriptions of the same startup remain visible under one entity, while related startups with strongly overlapping founding teams remain separate and visibly linked.
- Mark founders shared across linked registry entries as confirmed across entries; names found in only some entries are shown as to confirm. Offline Clean resolves stale review items while preserving their evidence and history.
- Added registry collection with preserved source evidence, normalized records, and a history of each run.
- Added offline Clean to reprocess stored evidence without another network request. It reconciles duplicates, backfills missing founders and descriptions, and keeps review items traceable.
- Clean now uses the latest completed collection and refuses to run if none has completed; failed or stale snapshots cannot become its input.
- Improved entity matching for differently composed Unicode names. Review findings distinguish automatic handling, nonblocking source gaps, and decisions that need a person.
- Resolve a missing row description when another row of the same confirmed entity supplies it. Extract a single valid URL from a mixed website field; ambiguous sites stay open without a name-only merge.
- Database upgrades preserve existing review decisions. Older databases affected by a previous upgrade remain identifiable; decisions already lost require restoration from a backup.

### Text preparation and profiles

- Prepare multiple descriptions for one entity in a single Groq call, keeping cleaned text for each source and a combined English retrieval summary. Cache entries record every contributing description and invalidate when that set changes.
- Added Prepare all to remove promotional wording from descriptions, retain the cleaned original language, and provide an English translation. Source descriptions stay intact.
- Added a confirmation preview with eligible records, expected model calls, profiles, and limits. Cached output is reused across configured models before any quota is reserved, so the preview matches the run.
- Added multiple Groq profiles with rotation when one is unavailable or rate limited. A run can resume from completed work; no paid fallback is used.
- Added per-profile usage and limits in Run and Settings. Missing credentials disable preparation only; collection and cleaning remain available.
- Preparation results are applied only to the record and description that produced them. Invalid responses remain retryable, and attempts and usage stay visible.
- A Groq request or provider fault such as a wrong model name now stops Prepare immediately with its HTTP status instead of being reported as throttling after one wasted call per profile. Replacing a disabled profile's key re-enables it on the next Prepare, and a profiles file that cannot be parsed is reported instead of showing as not configured.

### Workspace and review

- Review and Data load on first view instead of before the first paint, so the app appears about a fifth sooner on a 150-record database.
- The Data table pages at the height it can show instead of 100 rows, with native columns instead of hand-drawn separators.
- Four tabs instead of seven: Pipeline (operations, saved runs, the live run, and the event log in one place), Review, Data, and Tools (probes, settings, about behind a small menu). Picking a saved run shows it on the same timeline the live run uses, with the event log narrowed to that run. Escape backs out one level everywhere; Enter on a record opens its detail; single-letter keys act only inside the pane that owns them.
- Rebuilt the terminal layout on one component set: no frames inside frames, one-row buttons and inputs, unboxed key-value tables, a single status chip style, and a modal for the Prepare confirmation. The Run tab shows operations as a menu with the run's status, timeline, and log beside it; the Records detail leads with findings and a one-line summary; the metric cards are gone. Under 100 columns the operations become a button row so the timeline and log stay on screen.

- One vocabulary across the interface: source row, record, startup, snapshot, finding, profile, and the three operations Collect, Clean, Prepare. Step titles and progress say what was asked for ("Match startups and save") instead of the function that runs. Failures show their cause and a next step instead of "Open Logs". Review findings are written for a reviewer ("Missing description", "Website is not a valid URL; kept as written"). The Prepare preview says how many descriptions need a model call and how many are reused. Settings, About, Help, and the dialogs use sentence case and drop the marketing lines; the version comes from package metadata.

- Run now offers a confirmed registry reset for a fresh Collect/Clean evaluation. It clears source and derived records plus old run history, while retaining Groq profiles, quotas, and usage counts.
- Records shows the main and additional descriptions, related registry entries, and founder evidence labels.
- Organized the terminal app into Run, Records, History, Database, Logs, Probes, and Settings, with keyboard navigation and dark and light themes.
- Records now offers search, an In review filter, source evidence, review notes, and a structured view of cleaned and translated text. Fixed review notes that were clipped in the detail view.
- In review now includes every open source gap and decision, with matching counts and badges. Source gaps remain visible without stopping Collect, Clean, or Prepare.
- Replaced the simple progress bar with a run console showing step progress, timings, counts, scoped logs, and live process metrics. Run status clearly distinguishes completion, cancellation, and failure.
- History shows past runs, outcomes, timestamps, and step summaries. Logs have filters, counts, and clear empty states.
- Added read-only record and preparation probes for checking a single input without database writes. Probe results remain separate, and cancellation stops active work.
- Database shows upgrade status and offers a two-step wipe confirmation. Wiping is blocked during an active pipeline.

### Reliability and usability

- Bounded registry downloads and fields, made untrusted text display literally without terminal controls, and warned when local credential files are readable by others.
- Closed the remaining display gaps: JSON object keys from source rows and error messages shown in any pane are now stripped of terminal controls too.
- Database and Settings tables render every cell literally; a registry value such as `[/]` no longer crashes the Database tab or restyles evidence. Unicode bidi overrides and line separators are stripped like other controls.
- The registry client refuses redirects and reports the target instead of recording another address's bytes under the configured URL.
- The database file, its journal, and its directory are private to the owner; startup warns when they are not. Wipe, table previews, and the schema tree see only DataOps' product tables, never the application's account tables.
- Profile names in the TOML file must use letters, digits, `_`, `.`, or `-`; others are skipped with a visible reason.
- Kept record browsing bounded in memory and reduced search work. On the 923-record local corpus, browse time fell from about 30 ms to 14 ms.
- Logs search waits for typing to pause and redraws as one write of the newest 500 matches (700 ms per keystroke before). Records paging and search update the existing rows instead of remounting 100 widgets (250 to 500 ms before). Startup freezes the permanent heap so garbage collection no longer pauses the screen for 80 to 130 ms every few dozen keystrokes.
- The Records and Database pagers are wide enough to draw their key hints, and the compact masthead draws its status row again under 100 columns.
- Logs no longer redraw the whole console for every entry once the 2000-entry buffer is full, so long Prepare sessions stay responsive. The Prepare preview loads cache state in one query instead of one per description per profile, and the minute-rate wait is as short as the oldest request allows.
- Improved Run and Probes on 80×24 terminals: controls stay visible, content stacks and scrolls, and status and log labels stay readable.
- Fixed empty-profile startup, misleading collection status, probe cancellation, and several error and focus cases found during manual testing.
- New terminal tokens: hover and selection are different colors, surfaces separate without borders, destructive actions are red, Prepare is outlined in information blue instead of filled, source-gap badges use the information tint, JSON numbers are violet in both themes, dark scrollbars and dropdowns follow the theme, and no widget holds a color literal. A unit test checks every text and border pair for contrast.
- Fixed two clipped button labels (Clean data, Prev), made the About dialog with the Athar mark reachable from Settings, kept disabled buttons readable in dark mode instead of fading them, kept the Records evidence disclosure open while stepping between records, showed unknown token counts as such, and stopped arrow keys in the Logs search box from moving focus.
- Added offline pipeline and UI tests plus architecture, pipeline, data, design, and test guides.
- Split the tests into a unit layer (services and data rules, under a minute) and a UI layer (headless app, a few minutes) with a `tests/run.py` selector, moved the UI tests out of the service files, removed nine tests that only restated rendering details or duplicated other tests, and silenced asyncio's slow-callback log.
- Split the 1400-line database service into a package of five stores (connection core, registry, runs, retrieval, preparation) behind the unchanged `DatabaseService` name; migration data fix-ups moved next to the registry rules they apply.
- Removed unused badge, editor-theme, and stylesheet code, dropped stage names no operation emits, shared one theme-detection helper across panes, passed structured step metrics to the timeline, and streamed registry downloads straight into memory instead of through a temporary file.
