-- Rebuild source_rows with a proper UUID primary key.
-- row_number is kept as an audit/display field only — no longer a PK or FK.
-- normalized_records still references (snapshot_id, row_number), so its data is copied
-- aside without that foreign key, the parent table is swapped, then it is rebuilt with
-- the foreign key restored. Under PRAGMA foreign_keys, dropping a referenced parent
-- table fails the moment real rows exist, so the downgrade would corrupt the upgrade.

CREATE TABLE source_rows_new (
    id TEXT PRIMARY KEY,
    snapshot_id TEXT NOT NULL REFERENCES source_snapshots(id) ON DELETE CASCADE,
    row_number INTEGER NOT NULL,
    raw_json TEXT NOT NULL,
    UNIQUE (snapshot_id, row_number)
);

INSERT INTO source_rows_new (id, snapshot_id, row_number, raw_json)
SELECT
    lower(
        hex(randomblob(4)) || '-' ||
        hex(randomblob(2)) || '-4' ||
        substr(hex(randomblob(2)), 2) || '-' ||
        substr('89ab', abs(random()) % 4 + 1, 1) ||
        substr(hex(randomblob(2)), 2) || '-' ||
        hex(randomblob(6))
    ),
    snapshot_id, row_number, raw_json
FROM source_rows;

CREATE TABLE normalized_records_interim (
    snapshot_id TEXT NOT NULL,
    row_number INTEGER NOT NULL,
    entity_id TEXT REFERENCES entities(id),
    name TEXT,
    record_json TEXT NOT NULL,
    PRIMARY KEY (snapshot_id, row_number)
);

INSERT INTO normalized_records_interim (snapshot_id, row_number, entity_id, name, record_json)
SELECT snapshot_id, row_number, entity_id, name, record_json
FROM normalized_records;

DROP TABLE normalized_records;
DROP TABLE source_rows;
ALTER TABLE source_rows_new RENAME TO source_rows;

CREATE TABLE normalized_records (
    snapshot_id TEXT NOT NULL,
    row_number INTEGER NOT NULL,
    entity_id TEXT REFERENCES entities(id),
    name TEXT,
    record_json TEXT NOT NULL,
    PRIMARY KEY (snapshot_id, row_number),
    FOREIGN KEY (snapshot_id, row_number) REFERENCES source_rows(snapshot_id, row_number)
);

INSERT INTO normalized_records (snapshot_id, row_number, entity_id, name, record_json)
SELECT snapshot_id, row_number, entity_id, name, record_json
FROM normalized_records_interim;

DROP TABLE normalized_records_interim;

-- Add UUID row reference to entities.
ALTER TABLE entities ADD COLUMN latest_row_id TEXT REFERENCES source_rows(id);

-- Rebuild entity_review_items with source_row_id FK instead of (snapshot_id, row_number).
-- Every stored review decision from the 002-era (snapshot_id, row_number) columns is
-- carried over through the rebuilt source_rows table before the old table is dropped.
CREATE TABLE entity_review_items_new (
    id TEXT PRIMARY KEY,
    entity_id TEXT REFERENCES entities(id) ON DELETE SET NULL,
    source_row_id TEXT REFERENCES source_rows(id) ON DELETE CASCADE,
    reason TEXT NOT NULL,
    resolved INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
);

INSERT INTO entity_review_items_new (id, entity_id, source_row_id, reason, resolved, created_at)
SELECT old_review.id, old_review.entity_id, sr.id, old_review.reason, old_review.resolved, old_review.created_at
FROM entity_review_items AS old_review
LEFT JOIN source_rows AS sr
    ON sr.snapshot_id = old_review.snapshot_id AND sr.row_number = old_review.row_number;

DROP TABLE entity_review_items;
ALTER TABLE entity_review_items_new RENAME TO entity_review_items;

CREATE INDEX IF NOT EXISTS idx_review_entity ON entity_review_items(entity_id);
CREATE INDEX IF NOT EXISTS idx_review_row ON entity_review_items(source_row_id);