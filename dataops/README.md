# Athar DataOps

- Local Textual workspace for collecting and inspecting Tunisian startup registry data.
- Python 3.13+, managed with uv; embedded Turso storage.

## Run

From the repository root:

```sh
uv run --project dataops athar-dataops
```

- Choose **Collect registry** to fetch data; no model credentials needed yet.
- Database: `~/.local/share/athar/athar.db`. Override with an absolute `DB_PATH`.
- One DataOps process per database. `.env` files are not loaded automatically.

## Status

Checked items are available; unchecked items are planned.

- [x] Collect registry data and preserve original source snapshots.
- [x] Normalize records, resolve conservative identities, and flag review items.
- [x] Search records, inspect evidence/JSON, and browse database tables.
- [x] Collection logs/cancellation, keyboard navigation, and light/dark themes.
- [ ] One-call language detection, translation, and fluff removal; retain originals separately.
- [ ] Local embeddings, retrieval indexes, and same-/cross-language retrieval checks for RAG.
- [ ] Claim/excerpt links, review handling, and personal-data filtering for public output.
- [ ] Reproducible datasets, recovery, and processing documentation.
- [ ] Track preprocessing/embedding usage without enforcing user quotas.

## Keys

- `1–5`: tabs · `/`: search · `Tab` / arrows: navigate.
- `Enter` / `Escape`: open/close Database row details in narrow terminals.
- `F1`: full help · `F6`: theme · `Ctrl+Q`: quit.

- [Architecture](../docs/dataops/ARCHITECTURE.md) · [Tests](../docs/dataops/TEST_SUITE.md)
- [Changes](CHANGELOG.md) · [Project overview](../README.md)
