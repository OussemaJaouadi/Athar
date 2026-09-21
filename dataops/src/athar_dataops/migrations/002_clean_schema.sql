ALTER TABLE entities ADD COLUMN name TEXT;
ALTER TABLE entities ADD COLUMN website TEXT;
ALTER TABLE entities ADD COLUMN description TEXT;
ALTER TABLE entities ADD COLUMN sector TEXT;
ALTER TABLE entities ADD COLUMN cohort_label TEXT;
ALTER TABLE entities ADD COLUMN cohort_date TEXT;
ALTER TABLE entities ADD COLUMN creation_year INTEGER;
ALTER TABLE entities ADD COLUMN retrieval_text TEXT;
ALTER TABLE entities ADD COLUMN detected_language TEXT;
ALTER TABLE entities ADD COLUMN is_embedded INTEGER NOT NULL DEFAULT 0;
ALTER TABLE entities ADD COLUMN status_signal TEXT;
ALTER TABLE entities ADD COLUMN first_snapshot_id TEXT REFERENCES source_snapshots(id);
ALTER TABLE entities ADD COLUMN latest_snapshot_id TEXT REFERENCES source_snapshots(id);
ALTER TABLE entities ADD COLUMN latest_row_number INTEGER;
ALTER TABLE entities ADD COLUMN created_at TEXT;
ALTER TABLE entities ADD COLUMN updated_at TEXT;

CREATE TABLE IF NOT EXISTS entity_founders (
    id TEXT PRIMARY KEY,
    entity_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_founders_entity ON entity_founders(entity_id);
CREATE INDEX IF NOT EXISTS idx_founders_name ON entity_founders(full_name);

CREATE TABLE IF NOT EXISTS entity_review_items (
    id TEXT PRIMARY KEY,
    entity_id TEXT REFERENCES entities(id) ON DELETE SET NULL,
    snapshot_id TEXT NOT NULL,
    row_number INTEGER NOT NULL,
    reason TEXT NOT NULL,
    resolved INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_review_entity ON entity_review_items(entity_id);
CREATE INDEX IF NOT EXISTS idx_review_snapshot ON entity_review_items(snapshot_id, row_number);

CREATE TABLE IF NOT EXISTS entity_embeddings (
    entity_id TEXT PRIMARY KEY REFERENCES entities(id) ON DELETE CASCADE,
    model_version TEXT NOT NULL,
    embedding BLOB NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_entities_sector ON entities(sector);
CREATE INDEX IF NOT EXISTS idx_entities_creation_year ON entities(creation_year);
CREATE INDEX IF NOT EXISTS idx_entities_cohort_date ON entities(cohort_date);
