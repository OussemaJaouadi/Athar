# DataOps changelog

## Unreleased

- Replaced the coarse progress bar with a run console: the pipeline renders as a full-width road of linked circles (`●` done, `◍` running, `○` waiting, `⊘` cancelled) with per-step timing and row-count badges and live app CPU/RSS metric chips that are session-only.
- Steps are selectable (arrows move along the road); scoped colored logs bound to the selected step in both Run and Logs panes via shared literal-safe formatting in `ui/log_format.py`.
- History panel lists recent runs from `pipeline_runs` and reloads stored step summaries from `run_steps`, including runs recorded before step details existed.
- Orchestrator persists per-stage timing for collect (`fetch → preserve → normalize → resolve`) and clean (`load → normalize → reconcile`), committing the terminal step even if UI reporting fails; quitting bounds cancellation and skips teardown UI/DB work while exiting.
- Scaffolded the uv package, configuration, and application entry point.
- Separated services, shared schemas, and UI with explicit dependency injection.
- Built the Textual workspace, reusable widgets, keyboard navigation, and light/dark themes.
- Added migrations 002 and 003: flattened entity columns and relational tables, plus UUID primary keys for source rows so row number becomes audit-only.
- Added an offline "Clean data" operation in the Run pane that re-normalizes preserved evidence and updates canonical entities without a network call. Repeated runs are idempotent: fields update in place, founders and review items are never duplicated.
- Reconciled the stored corpus: exact `(name_key, domain)` duplicates are flagged `is_duplicate` on shadow rows, superseded review items are pruned, founders and missing descriptions are backfilled from preserved records, and shadow rows are suppressed from default searches while raw evidence stays intact.
- Collapsed industry into sector, dropped junk fields, and wrote founders and review items into relational entity tables.
- Loaded runtime configuration from a project-local `.env` file with real values injected per machine.
- Chose the interface theme (dark or light) from `THEME` in the environment before startup.
- Added pipeline and UI tests plus architecture, pipeline, data-contract, and design guides, moved under `docs/`.
