# DataOps test suite

## Commands

From `dataops/`:

```sh
uvx ruff check src tests --no-cache                # lint, one line per error
uvx ruff check src tests --no-cache --statistics   # counts per rule
uvx ruff check src tests --no-cache --fix          # auto-fix what is fixable
uv run python -m unittest discover -s tests        # full suite (95 tests)
uv run python -m unittest discover -s tests -p 'test_checkpoints.py'   # one file
uv run python -m unittest discover -s tests -p 'test_checkpoints.py' -k wipe_ui   # one test
```

From the repo root:

```sh
uvx ruff check dataops/src dataops/tests --no-cache
uv run --project dataops python -m unittest discover -s dataops/tests
```

- Uses standard-library `unittest`; asynchronous cases use isolated event loops.
- Pipeline/workspace tests use temporary Turso databases and mocked HTTP responses.
- No live registry or model calls; fixtures close clients/connections and remove temporary files.

## Coverage

### `test_pipeline.py`

- Collection, preserved bytes/source rows, normalized records, and run history.
- Stable identity across reimports; ambiguous, conflicting, and malformed records.
- Invalid JSON, unexpected payloads, HTTP failures, timeout, and cancellation.
- Transaction rollback, foreign keys, migrations, reopening, and refusal of unknown legacy schemas.
- Upgrading a 001-era database with existing evidence through migrations 002, 003, and 004.
- Offline "Clean data" over stored evidence: entity, founder, and review-item writes, idempotent re-runs, and the missing-snapshot failure.
- Corpus reconcile: within-run and cross-corpus duplicate flagging, `is_duplicate` suppression in default listings, founders/description backfill on a legacy-shaped corpus, idempotence across repeated cleans, and `run_steps` recorded with stable start times.
- Bounded queries, Unicode search across pages, overview failures, and absolute-path validation.
- Committed terminal steps survive reporting failure; failed startup does not create orphan steps.

### `test_smoke.py`

- Headless Textual interactions: collection, records, evidence, database previews, and tab shortcuts.
- Empty states, search beyond the first page, and stale-detail clearing.
- Responsive cancellation, failure recovery, and cancellation before shutdown.
- Narrow-terminal row inspection, keyboard open/close, and resizing.
- Primary-button contrast in both themes and honest status when database reads fail.
- About dialog resizing and packaged artwork/migration availability.
- Live step filtering, preserved tab shortcuts, sampler stop, History isolation, and older runs without step details.
- First-class History: persisted run metadata, operation, outcome, filter/refresh, and step-summary inspection.
- Normal Logs and Probes tabs, filtered log counts, no-match states, probe result separation, bounded probe output areas, and probe busy-state input locking.
- Tab keybindings: number keys and `]`/`[` cycling switch all primary panes.

### `test_checkpoints.py`

- Normal Probes tab reflects read-only record and prepare probes, validates results, and confirms no database writes.
- Probe inputs are disabled during requests; result labels and clear actions are available; completion requires profiles.
- Record probe runs with no Groq profiles configured (default install) without crashing; prepare stays disabled.

### `test_preparation.py`

- Prepare lifecycle: records, caching, usage/marker tracking, key switching, the issue classification pipeline, and confirmation before model calls.
- Missing keys disable only preparation; authentication and rate limits stop without rotation or token guessing.

### `test_profiles.py`

- Groq rotation: least-loaded selection, 401/403 permanent disable, throttling and cooldown (one round per profile), "resume later"/"reset" stops, and unknown-usage outcomes.
- Legacy single-key fallback, free-tier quota seeding per profile, quota-aware rotation, and loss of last eligible profile.
- TOML profiles loading, including a malformed file yielding no profiles.

### `test_logs.py`

- Entry formatting, severity filtering, and text search.
- Search focus, Escape behavior, clearing logs, and unintended shortcut prevention.
- Retained entries when rebuilding for light mode; active sidebar label contrast and filtered states.

### `test_arabic.py`

- Arabic detection, escaped Unicode decoding, and mojibake repair.
- Reshaping/reordering mixed and multiline text, including nested objects.

### `test_metrics.py`

- Time-weighted process CPU averages, sampled peak RSS, missing samples, and access failures.
- Literal messages and status/severity colors in both themes.

## Run

From `dataops/`:

```sh
uv run python -m unittest discover -s tests -v
```

One file:

```sh
uv run python -m unittest discover -s tests -p 'test_pipeline.py' -v
```

- Add coverage beside the behavior it protects; run the affected file first.
- Headless checks cover behavior and selected styling assertions, not complete visual validation.
- Update this inventory when coverage changes.
