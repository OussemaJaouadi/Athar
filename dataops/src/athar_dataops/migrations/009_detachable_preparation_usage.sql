-- Keep Groq consumption when a registry reset removes its source rows and runs.
CREATE TABLE preparation_usage_new (
    id TEXT PRIMARY KEY,
    run_id TEXT REFERENCES pipeline_runs(id) ON DELETE SET NULL,
    source_row_id TEXT REFERENCES source_rows(id) ON DELETE SET NULL,
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
INSERT INTO preparation_usage_new SELECT * FROM preparation_usage;
DROP TABLE preparation_usage;
ALTER TABLE preparation_usage_new RENAME TO preparation_usage;
CREATE INDEX idx_preparation_usage_profile ON preparation_usage(profile, key_fingerprint);
