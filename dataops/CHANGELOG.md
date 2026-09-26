# DataOps changelog

## Unreleased

- Records gains an "In review" toggle: one click filters the list to rows with open human review items (same indexed ledger the stats' review count uses), combines with search, and shows `· in review` in the count; the no-match state explains itself honestly.
- Record search and browse stay bounded in memory: the corpus scan walks matching row numbers in 1000-row keyset batches and record JSON is fetched only for the visible 100 rows, so a large corpus never sits in RAM as one list. Table browsing reuses a cached schema instead of re-running PRAGMAs for every page.
- The wipe confirmation button is now amber (`$warning`) instead of red; the dialog still reads as destructive via its red border and warning text.
- Preparation preview and quota state are now typed records (`PreparePreview`, `ProfileQuotaState`, `ProfileOverview` in `schemas/preparation.py`) with one owner per field instead of plain dicts passed through services and panes.
- Record search measured and tightened (audit C7): browse no longer validates every corpus row before showing the visible 100, and ASCII queries skip NFC normalization (a no-op for ASCII). Measured on this machine: real corpus 923 rows 30ms→14ms browse / 30ms→22ms search; synthetic 10k 152ms→82ms, 50k 767ms→385ms, 100k 1.6s→0.95s browse. An indexed/cached search representation is not justified while the registry stays in the low thousands of rows.
- Correctness from the code audit: Clean now reads from the latest *completed* collect snapshot (A→B→A no longer reuses stale rows), the preparation ledger only counts configured profiles, migration 003 preserves stored review decisions, Prepare preview counts every cached candidate under one profile, unknown token counts consume the daily estimate after a restart, and the Collection card only describes collect runs.
- Security hardening: terminal control characters are stripped at the shared display boundary (`sanitize_display`), registry responses are bounded (64 MiB stream cap, 100k rows, 64 KiB per field), probe/prepare result labels never parse markup, credential files warn when group/other-readable (`chmod 600 dataops/.env dataops/.env.profiles.toml`), and the README now states that `.env*` files *are* auto-loaded and must stay private.
- 80×24 compact layout: Run and Probes stack into one scrollable column with primary actions above the fold, pane expansion no longer auto-scrolls controls out of view when a run starts, configured profiles show immediately as configured/registered/disabled in Run and Settings, log lines keep fixed metadata columns with truncated steps, and History row summaries use short `rec`/`rev` labels.
- Housekeeping: dead UI state removed (`_view_generation`, `_viewing_run_id`, `_prepare_confirming`, `_restore_selection`, the "stored summary" log branch), all `suppress(Exception)` narrowed to `NoMatches`/`ValueError` with usage errors surfaced in the Settings table, `record_page` fetches preparations/review decisions only for the visible page, and `[tool.ruff]` in `pyproject.toml` makes the lint gate cwd-independent (both repo root and `dataops/` report 0).

- Polish round from manual testing: a consolidated Run context header and status bar with a scrollable body, single-underline rail focus/hover states with the missing hover token, auto-width probe title cards, a taller Prepare profile picker, and probe results that only appear once produced.
- History detail now renders markup with an outcome status chip and honest `Started`/`Completed` timestamps from a per-run row lookup instead of "Unknown time".
- Wipe data refuses while a pipeline is running using the orchestrator's live state, probe cancellation propagates so workers actually stop, and the profile picker no longer crashes when no Groq profiles are configured.
- NFC-normalized name keys keep entity identity stable across composed characters, and duplicate step titles can no longer overwrite each other.
- The codebase passes `ruff check` with stock defaults (98 errors → 0): broad handlers narrowed to real failure sets or converted to `contextlib.suppress`, mutable class attributes annotated as `ClassVar`, and datetime/type-error nits fixed.

- Reorganized the workspace around seven primary tabs: **Run**, **Records**, **History**, **Database**, **Logs**, **Probes**, and **Settings**.
- Added a first-class History view with refresh, filtering, stable selection, run outcomes, and step summaries.
- Reworked Probes into explicit result surfaces with clear actions, result labels, and light/dark theme states.
- Added an operational masthead state for running, completed, cancelled, and failed operations.
- Added a Prepare all preview/confirmation showing eligible descriptions, uncached model calls, profiles, models, and provider limits before any model call.
- Added structured Groq profile/provider-limit summaries to Run and Settings.
- Improved Logs filtered counts and empty/no-match feedback, including light-mode sidebar contrast.
- Made Probe inputs immutable while a request is running and exposed cancellation immediately.

- Added a Groq-backed **Prepare all** operation in the Run pane with preview/confirmation:
  - one call per uncached description detects the original language, removes only marketing fluff, keeps the cleaned source-language copy, and provides a faithful English translation (strict JSON, `qwen/qwen3.8-27b`);
  - output populates `entities.retrieval_text` / `detected_language`; the original description stays untouched as provenance;
  - unchanged descriptions are never re-invoked — cached per source row, description hash, provider, model, and prompt/schema/target versions (including after switching credentials);
  - outputs are published only while the entity still points at the exact evidence row and description that produced them.
- Added multi-profile **Groq rotation** via git-ignored `dataops/.env.profiles.toml` (`[[profile]]` blocks; legacy `GROQ_API_KEY` / `GROQ_PROFILE` fallback when absent):
  - each attempt uses the least-loaded profile with remaining budget;
  - `401`/`403` permanently disable a profile (persisted); `429`/`503`/`530` cool it and rotate — one round per profile per run;
  - stops visibly with "resume later"/"reset" semantics when rotation or daily budgets are spent; completed work stays and the cache resumes later;
  - no paid fallback, and keys are never stored or displayed.
- Added the `profiles` registry and data-driven `dataops_quotas` (migration 006):
  - free-tier defaults seeded per profile (`records_per_day` 1000/day, `tokens_per_day` 200000/day, `requests_per_minute` 30/minute, `estimate_tokens_per_record` 1000);
  - limits are ordinary rows the operator edits directly; cache hits consume nothing;
  - Settings pane lists each profile's quotas, today's usage, and disabled status; the profile list caps at six entries with a per-profile usage summary and a "… and N more profiles" note.
- Every preparation attempt is accounted for in `preparation_usage` (profile and key fingerprint, model, tokens, duration, request ID, outcome); unknown consumption stays explicitly unknown.
- Preparation runs on the same timeline, logs, and metrics as Collect/Clean; without a key only this operation is disabled.
- Reclassified review findings with shared codes and categories (automatic / incomplete / human) via migration 005; only unresolved genuine conflicts count toward "records needing review".
- The Records pane exposes original, cleaned, and translated text under a **Prepared retrieval text** disclosure, rendered as a structured card (detected language, producing Groq profile and model, cleaned original, English translation, flagged fluff); list rows, collapsibles, and detail boxes were unified with roomier spacing.
- Redesigned the **Probes** tab (`6`; `ctrl/alt+6`) as a control panel with two bounded, read-only probe cards, explicit result labels, clear-result actions, and responsive internal scrolling:
  - **Record probe** fetches, hashes, parses, and normalizes a single row exactly as Collect would — nothing is written to the database;
  - **Prepare probe** sends exactly one prompt for one description with no caching, quota, or writes;
  - a filterable Groq profile picker appears when more than six profiles are configured;
  - busy states tint the card borders and re-disable their buttons.
- The Database tab (`4`) now shows applied migrations and a **Wipe data** tool with a two-step confirmation; wiping clears all tables in FK-safe order and re-runs migrations.
- Tab navigation is fully keyboard-driven; hidden-pane focus restoration can no longer swallow programmatic tab switches.
- The Logs rail is fully usable from the keyboard: `Up`/`Down` cycle the seven filter and action buttons with wraparound, `Enter` activates, and `Esc` returns to the console; hovering a rail button gives a distinct highlight from the active filter.
- Profiles loading tolerates a malformed `.env.profiles.toml` (falls back to the legacy single key) instead of failing startup.
- Replaced the progress bar with a run console: pipeline road of linked circles (`●` done, `◍` running, `○` waiting, `⊘` cancelled), per-step timing and row-count badges, and live session-only CPU/RSS metric chips.
- Steps are selectable; scoped colored logs bind to the selected step in both Run and Logs panes.
- History lists recent runs from `pipeline_runs`; the orchestrator persists per-stage timing for collect and clean, even when UI reporting fails.
- Added an offline "Clean data" operation (re-normalize preserved evidence, update canonical entities; idempotent).
- Reconciled the stored corpus: duplicates flagged, superseded review items pruned, founders/descriptions backfilled, shadow rows suppressed from default searches.
- Added migrations 002/003: flattened entity columns and relational tables, plus UUID source-row keys (row number becomes audit-only).
- Collapsed industry into sector and wrote founders and review items into relational tables.
- Loaded runtime configuration from a project-local `.env`; theme chosen from `THEME`.
- Built the uv package scaffold, service/schema/UI separation with dependency injection, the Textual workspace, keyboard navigation, and dark/light themes.
- Added pipeline and UI tests plus architecture, pipeline, data-contract, and design guides, moved under `docs/`.
