ALTER TABLE entity_review_items ADD COLUMN code TEXT NOT NULL DEFAULT 'unclassified';
ALTER TABLE entity_review_items ADD COLUMN category TEXT NOT NULL DEFAULT 'human';
ALTER TABLE pipeline_runs ADD COLUMN operation TEXT NOT NULL DEFAULT 'collect';

CREATE TABLE text_preparations (
    cache_key TEXT PRIMARY KEY,
    source_row_id TEXT NOT NULL REFERENCES source_rows(id),
    entity_id TEXT NOT NULL REFERENCES entities(id),
    input_hash TEXT NOT NULL,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    prompt_version TEXT NOT NULL,
    schema_version TEXT NOT NULL,
    target_language TEXT NOT NULL,
    output_json TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE INDEX idx_preparations_source ON text_preparations(source_row_id);

CREATE TABLE preparation_usage (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL REFERENCES pipeline_runs(id),
    source_row_id TEXT NOT NULL REFERENCES source_rows(id),
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    profile TEXT NOT NULL,
    key_fingerprint TEXT NOT NULL,
    started_at TEXT NOT NULL,
    duration_seconds REAL,
    input_tokens INTEGER,
    output_tokens INTEGER,
    request_id TEXT,
    outcome TEXT NOT NULL,
    error TEXT
);
CREATE INDEX idx_preparation_usage_profile ON preparation_usage(profile, key_fingerprint);
