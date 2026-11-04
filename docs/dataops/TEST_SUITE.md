# DataOps test suite

Two layers, chosen by cost. Every test pins a documented invariant or a bug that once shipped; a test that only shows "something rendered" does not belong here.

| Layer | What it exercises | Tests | Time |
| --- | --- | --- | --- |
| `tests/unit` | Services and data rules against a real temporary Turso database with mocked HTTP. No Textual app, except the small Logs pane harness. | 95 | under a minute |
| `tests/ui` | The headless Textual app: layout, focus, keybindings, literal rendering, and the operator flows that touch the database. | 38 | a few minutes |

## Commands

From the repository root:

```sh
uv run --project dataops dataops/tests/run.py unit          # every change
uv run --project dataops dataops/tests/run.py ui            # before a commit
uv run --project dataops dataops/tests/run.py all
uv run --project dataops dataops/tests/run.py unit -k reconcile   # select by name
uvx ruff check dataops/src dataops/tests --no-cache
```

One file, with the layer directory as the start and `tests` as the top level:

```sh
uv run --project dataops python -m unittest discover -s dataops/tests/unit -t dataops/tests -p 'test_pipeline.py'
```

- Standard-library `unittest`; asynchronous cases use isolated event loops.
- `tests/support.py` holds the shared pieces: `registry_row` (a synthetic registry record), `render_text` (plain-text rendering of a Rich renderable), and `PreparationFixture` (one collected record plus a steerable fake Groq). It also silences asyncio's slow-callback log, which Textual mounts trip constantly.
- No live registry or model calls; fixtures close clients and connections and remove temporary files.

## Unit layer

### `test_pipeline.py`

- Collection preserves exact bytes and source rows, normalizes records, and records run history and per-step timing.
- Committed terminal steps survive a later reporting failure; a failed start writes no orphan step.
- Identity is stable across reimports; a different website, a different hosted page path, or a distinct description under the same name and site each resolve as documented; related startups with shared founders stay separate and linked.
- Only content-equivalent rows are duplicates; JSON key order and null placeholders do not count.
- Malformed rows, mixed URL fields, and competing URLs land in review without blocking; a same-entity description covers only its own row's gap.
- The review filter, the stats' review count, and pagination use one ledger.
- Invalid JSON, a non-array payload, an oversized body, too many rows, and an HTTP failure each fail visibly while preserving whatever was already stored.
- A failed derived write rolls back entities and records; cancellation during the derived transaction rolls back; cancellation before it keeps the preserved source; a timeout is a persisted failure.
- Bounded table pages, Unicode-aware search across pages, and refusal of a table name that is not in the schema.
- A redirect from the registry fails the run with the target in the error and stores no snapshot; account tables in the same file are invisible to the schema, paging, and wipe; the database and its journal are owner-only.
- Reopening keeps data and migration history; foreign keys reject orphan rows; an unknown legacy database is refused without touching it.
- Upgrades from the 001, 002, and 008 schemas keep evidence, review items, and usage; migration 010 backfills coverage without trusting a legacy false entity group; the superseded 003 checksum stays visible as `legacy`.
- Clean is offline, requires a completed collection, refuses a failed collection's snapshot, keeps source gaps in review without blocking, reconciles a pre-004 corpus, and is idempotent.
- Normalization rejects invalid dates, years, websites, and overlong fields while leaving the source value untouched; a relative database path is refused.

### `test_preparation.py`

- One call per entity for single and combined descriptions; cached output is reused with fresh provenance; a changed description invalidates it.
- The preview counts every cached candidate under any configured model and issues a fixed number of queries regardless of corpus size; preview and run agree.
- Unknown token counts consume the same estimate after a restart; a removed profile never joins a later run; a duplicate cannot hide the canonical description.
- Malformed, refused, unanchored, and detail-losing replies are retryable and accounted; 401, 403, and 429 stop without token guessing; cancellation records unknown consumption and the next run resumes.
- A missing key disables only preparation; the migration that classified old findings keeps evidence; source gaps enter nonblocking review and duplicates do not.

### `test_profiles.py`

- Rotation picks the least-loaded profile, cools a rate-limited one for a single round, disables an unauthenticated one, and stops visibly when every profile is spent or no daily budget remains.
- A provider fault such as HTTP 400 stops after one call without cooling or disabling anything; a rotated key clears a persisted `disabled` flag and an unchanged key keeps it.
- Free-tier quota rows are seeded per profile; the minute-rate wait follows the oldest request, not a flat minute.
- The profiles TOML loads, skips invalid entries and names outside the safe character set, and reports a malformed or entry-less file without echoing its values; a lone legacy key becomes an implicit profile; credential file modes are warned about.

### `test_logs.py`

- Entry formatting keeps fixed metadata columns and never interprets messages as markup.
- Severity filter and search; slash focuses search; Escape clears then refocuses; bare letters do nothing; Ctrl+L clears.
- A search rebuild is one batched console write of the newest 500 matches with a one-line summary of the rest; a full 2000-entry buffer evicts the oldest entry without redrawing; counts and the visible/total header stay right after a filter change.
- Rail arrows cycle the sidebar and never move focus out of the search box.

### `test_themes.py`

- Every text pair the interface relies on meets 4.5:1 and every border or indicator pair meets 3:1 in both themes; hover differs from selection; panels and surfaces separate; primary and information differ.

### `test_metrics.py`, `test_arabic.py`

- Time-weighted CPU averages and sampled peaks; missing samples and denied access are not invented zeroes; status colors per theme with literal messages.
- Arabic detection, escape decoding, mojibake repair, reshaping; every string value and key is stripped of terminal controls, bidi overrides, and line separators; exception text shown in a widget is control-free and never empty.

## UI layer

### `test_smoke.py`

- Collect from the Run tab at 80×24 and 120×40, then inspect records, history, and table previews; number keys, brackets, and Alt arrows switch every tab.
- Cancellation stays responsive, an HTTP failure restores the controls, and Ctrl+Q cancels before services close.
- Records: readable details with the evidence on demand, the disclosure persisting across records and collapsing on reload, source gaps badged without a decision, hostile registry text and JSON keys rendered literally, a failing load showing its error without controls, search beyond the first page, honest no-match and empty states.
- Narrow database inspection keeps the selected row; the compact layout stacks Run and Probes at 80×24 with the primary controls on screen.
- Primary buttons meet 4.5:1 in both themes; every visible button label is fully drawn on every tab at both sizes; the compact masthead draws its status row; paging the Records list reuses its rows; the collection card says Unknown when the read fails.
- Live step selection filters the run log and keeps tab keys; the About dialog opens from Settings.
- History loads persisted runs and steps, refreshes to the first run, and shows an older run without step details honestly.

### `test_checkpoints.py`

- The record probe fetches, normalizes, and renders one row with no database writes; its labels and table cells are literal and control-free; an out-of-range row is reported.
- The prepare probe validates one reply with no cache, quota, or database writes, and is disabled without profiles while the record probe still works.
- The Database tab renders markup-like registry values such as `[/]` literally without crashing; the Records review filter toggles scope; migration status reports fresh, tampered, and unknown rows.
- Wipe clears every row but the migration ledger and the database reopens cleanly; the wipe dialog confirms and refreshes.
- Registry reset clears the graph, keeps Groq profiles, quotas, and usage, rolls back on failure, and the Run tab confirms it and stays ready to collect.

### `test_prepare_ui.py`

- Configured profiles appear before first seeding; Prepare shows its preview and makes no call until confirmed; after a run the Records and Settings panes show the prepared text and usage without the key; combined descriptions show the secondary text and summary; the Settings usage table caps long profile lists.

## Working rules

- Add a test beside the behavior it protects, in the cheapest layer that can observe it. If a service can prove it, do not boot the app.
- A UI test earns its seconds by checking a state the user can hit: focus, layout at a real size, a literal render of hostile text, or a flow that writes to the database.
- Update this inventory when coverage changes.
