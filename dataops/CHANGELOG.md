# DataOps changelog

## Unreleased

- Scaffolded the uv package, configuration, and application entry point.
- Separated services, shared schemas, and UI with explicit dependency injection.
- Built the Textual workspace, reusable widgets, keyboard navigation, and light/dark themes.
- Added migrations 002 and 003: flattened entity columns and relational tables, plus UUID primary keys for source rows so row number becomes audit-only.
- Added an offline "Clean data" operation in the Run pane that re-normalizes preserved evidence and updates canonical entities without a network call.
- Collapsed industry into sector, dropped junk fields, and wrote founders and review items into relational entity tables.
- Added pipeline and UI tests plus architecture, pipeline, data-contract, and design guides, moved under `docs/`.
