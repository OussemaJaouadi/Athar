CREATE TABLE schema_migrations (
    version INTEGER PRIMARY KEY,
    checksum TEXT NOT NULL,
    applied_at TEXT NOT NULL
);

-- Artifact bytes are the citation source, including fields we do not normalize.
CREATE TABLE source_snapshots (
    id TEXT PRIMARY KEY,
    source_url TEXT NOT NULL,
    content_hash TEXT NOT NULL UNIQUE,
    fetched_at TEXT NOT NULL,
    raw_content BLOB NOT NULL
);
CREATE TABLE source_rows (
    snapshot_id TEXT NOT NULL REFERENCES source_snapshots(id),
    row_number INTEGER NOT NULL,
    raw_json TEXT NOT NULL,
    PRIMARY KEY (snapshot_id, row_number)
);

-- Identity outlives a snapshot. Row position is evidence location, not identity.
CREATE TABLE entities (
    id TEXT PRIMARY KEY,
    name_key TEXT NOT NULL,
    domain TEXT NOT NULL,
    UNIQUE (name_key, domain)
);
CREATE TABLE normalized_records (
    snapshot_id TEXT NOT NULL,
    row_number INTEGER NOT NULL,
    entity_id TEXT REFERENCES entities(id),
    name TEXT,
    record_json TEXT NOT NULL,
    PRIMARY KEY (snapshot_id, row_number),
    FOREIGN KEY (snapshot_id, row_number) REFERENCES source_rows(snapshot_id, row_number)
);
CREATE TABLE pipeline_runs (
    id TEXT PRIMARY KEY,
    started_at TEXT NOT NULL,
    completed_at TEXT,
    snapshot_id TEXT REFERENCES source_snapshots(id),
    status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed', 'cancelled')),
    records_processed INTEGER NOT NULL DEFAULT 0,
    review_count INTEGER NOT NULL DEFAULT 0,
    error TEXT
);
CREATE INDEX runs_by_completion ON pipeline_runs(status, completed_at);
