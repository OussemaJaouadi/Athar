# DataOps changelog

## Unreleased

### Collection and data quality

- Resolved false identity reviews from shared website hosts: Facebook and Google Sites pages now use their page paths, and a new site creates a separate entity without a manual merge decision.
- Suppress only content-equivalent duplicate rows. Different descriptions of the same startup remain visible under one entity, while related startups with strongly overlapping founding teams remain separate and visibly linked.
- Mark founders shared across linked registry entries as confirmed across entries; names found in only some entries are shown as to confirm. Offline Clean resolves stale review items while preserving their evidence and history.
- Added registry collection with preserved source evidence, normalized records, and a history of each run.
- Added offline Clean to reprocess stored evidence without another network request. It reconciles duplicates, backfills missing founders and descriptions, and keeps review items traceable.
- Clean now uses the latest completed collection and refuses to run if none has completed; failed or stale snapshots cannot become its input.
- Improved entity matching for differently composed Unicode names. Review counts now focus on unresolved conflicts that need a person, while automatic and incomplete-data findings remain visible.
- Database upgrades preserve existing review decisions. Older databases affected by a previous upgrade remain identifiable; decisions already lost require restoration from a backup.

### Text preparation and profiles

- Prepare multiple descriptions for one entity in a single Groq call, keeping cleaned text for each source and a combined English retrieval summary. Cache entries record every contributing description and invalidate when that set changes.
- Added Prepare all to remove promotional wording from descriptions, retain the cleaned original language, and provide an English translation. Source descriptions stay intact.
- Added a confirmation preview with eligible records, expected model calls, profiles, and limits. Cached output is reused across configured models before any quota is reserved, so the preview matches the run.
- Added multiple Groq profiles with rotation when one is unavailable or rate limited. A run can resume from completed work; no paid fallback is used.
- Added per-profile usage and limits in Run and Settings. Missing credentials disable preparation only; collection and cleaning remain available.
- Preparation results are applied only to the record and description that produced them. Invalid responses remain retryable, and attempts and usage stay visible.

### Workspace and review

- Records shows the main and additional descriptions, related registry entries, and founder evidence labels.
- Organized the terminal app into Run, Records, History, Database, Logs, Probes, and Settings, with keyboard navigation and dark and light themes.
- Records now offers search, an In review filter, source evidence, review notes, and a structured view of cleaned and translated text. Fixed review notes that were clipped in the detail view.
- Replaced the simple progress bar with a run console showing step progress, timings, counts, scoped logs, and live process metrics. Run status clearly distinguishes completion, cancellation, and failure.
- History shows past runs, outcomes, timestamps, and step summaries. Logs have filters, counts, and clear empty states.
- Added read-only record and preparation probes for checking a single input without database writes. Probe results remain separate, and cancellation stops active work.
- Database shows upgrade status and offers a two-step wipe confirmation. Wiping is blocked during an active pipeline.

### Reliability and usability

- Bounded registry downloads and fields, made untrusted text display literally without terminal controls, and warned when local credential files are readable by others.
- Kept record browsing bounded in memory and reduced search work. On the 923-record local corpus, browse time fell from about 30 ms to 14 ms.
- Improved Run and Probes on 80×24 terminals: controls stay visible, content stacks and scrolls, and status and log labels stay readable.
- Fixed empty-profile startup, misleading collection status, probe cancellation, and several error and focus cases found during manual testing.
- Added offline pipeline and UI tests plus architecture, pipeline, data, design, and test guides.
