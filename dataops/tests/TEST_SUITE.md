# DataOps test suite

- Uses standard-library `unittest`; asynchronous cases use isolated event loops.
- Pipeline/workspace tests use temporary Turso databases and mocked HTTP responses.
- No live registry or model calls; fixtures close clients/connections and remove temporary files.

## Coverage

### `test_pipeline.py`

- Collection, preserved bytes/source rows, normalized records, and run history.
- Stable identity across reimports; ambiguous, conflicting, and malformed records.
- Invalid JSON, unexpected payloads, HTTP failures, timeout, and cancellation.
- Transaction rollback, foreign keys, migrations, reopening, and refusal of unknown legacy schemas.
- Bounded queries, Unicode search across pages, overview failures, and absolute-path validation.

### `test_smoke.py`

- Headless Textual interactions: collection, records, evidence, database previews, and tab shortcuts.
- Empty states, search beyond the first page, and stale-detail clearing.
- Responsive cancellation, failure recovery, and cancellation before shutdown.
- Narrow-terminal row inspection, keyboard open/close, and resizing.
- Primary-button contrast in both themes and honest status when database reads fail.
- About dialog resizing and packaged artwork/migration availability.

### `test_logs.py`

- Entry formatting, severity filtering, and text search.
- Search focus, Escape behavior, clearing logs, and unintended shortcut prevention.
- Retained entries when rebuilding for light mode; not a full color audit.

### `test_arabic.py`

- Arabic detection, escaped Unicode decoding, and mojibake repair.
- Reshaping/reordering mixed and multiline text, including nested objects.

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
