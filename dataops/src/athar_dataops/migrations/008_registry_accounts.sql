-- Separate website host from the site identity used to link registry entries.
-- The old name+host constraint treated every Facebook or Google Sites page as
-- one company. Rebuilding this table requires foreign keys off for this one
-- migration. initialize() verifies every reference before restoring them.
CREATE TABLE entities_new (
    id TEXT PRIMARY KEY,
    name_key TEXT NOT NULL,
    domain TEXT NOT NULL,
    identity_key TEXT NOT NULL,
    name TEXT,
    website TEXT,
    description TEXT,
    sector TEXT,
    cohort_label TEXT,
    cohort_date TEXT,
    creation_year INTEGER,
    retrieval_text TEXT,
    detected_language TEXT,
    is_embedded INTEGER NOT NULL DEFAULT 0,
    status_signal TEXT,
    first_snapshot_id TEXT REFERENCES source_snapshots(id),
    latest_snapshot_id TEXT REFERENCES source_snapshots(id),
    latest_row_number INTEGER,
    created_at TEXT,
    updated_at TEXT,
    latest_row_id TEXT REFERENCES source_rows(id),
    preparation_input_hash TEXT,
    UNIQUE (name_key, identity_key)
);
INSERT INTO entities_new (
    id,name_key,domain,identity_key,name,website,description,sector,
    cohort_label,cohort_date,creation_year,retrieval_text,detected_language,
    is_embedded,status_signal,first_snapshot_id,latest_snapshot_id,
    latest_row_number,created_at,updated_at,latest_row_id
)
SELECT id,name_key,domain,domain,name,website,description,sector,
    cohort_label,cohort_date,creation_year,retrieval_text,detected_language,
    is_embedded,status_signal,first_snapshot_id,latest_snapshot_id,
    latest_row_number,created_at,updated_at,latest_row_id
FROM entities;
DROP TABLE entities;
ALTER TABLE entities_new RENAME TO entities;
CREATE INDEX idx_entities_sector ON entities(sector);
CREATE INDEX idx_entities_creation_year ON entities(creation_year);
CREATE INDEX idx_entities_cohort_date ON entities(cohort_date);

ALTER TABLE entity_founders ADD COLUMN name_key TEXT;
ALTER TABLE entity_founders ADD COLUMN evidence_status TEXT NOT NULL DEFAULT 'reported';
ALTER TABLE entity_founders ADD COLUMN support_count INTEGER NOT NULL DEFAULT 1;
ALTER TABLE entity_review_items ADD COLUMN resolution_note TEXT;

CREATE TABLE entity_relations (
    entity_a_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    entity_b_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    source_row_a_id TEXT NOT NULL REFERENCES source_rows(id),
    source_row_b_id TEXT NOT NULL REFERENCES source_rows(id),
    relation_kind TEXT NOT NULL,
    shared_founders INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (entity_a_id, entity_b_id),
    CHECK (entity_a_id < entity_b_id)
);

CREATE TABLE text_preparation_sources (
    cache_key TEXT NOT NULL REFERENCES text_preparations(cache_key) ON DELETE CASCADE,
    source_row_id TEXT NOT NULL REFERENCES source_rows(id),
    role TEXT NOT NULL,
    input_hash TEXT NOT NULL,
    PRIMARY KEY (cache_key, source_row_id)
);
