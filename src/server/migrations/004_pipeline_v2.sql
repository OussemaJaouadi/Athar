-- Pipeline v2: raw registry entries and startups, nothing in between.
-- The cleaned form of an entry is a pure function of its raw JSON, so it is computed when needed, not stored.
-- Review is gone: every case it held is either a fact about the data or settled by a rule.

DROP TABLE review_items;
DROP TABLE records;
DELETE FROM startups_fts;
DROP TABLE startups;
DROP TABLE source_rows;
DROP TABLE source_snapshots;

-- Collect: one row per download that published a different set of rows than the one before it.
-- The registry reshuffles its rows on every request, so content_hash covers the set of rows, not the bytes.
-- A download with the same rows only moves last_checked_at.
CREATE TABLE downloads (
  id              INTEGER PRIMARY KEY,
  url             TEXT NOT NULL,
  fetched_at      TEXT NOT NULL,
  last_checked_at TEXT NOT NULL,
  content_hash    TEXT NOT NULL,
  byte_size       INTEGER NOT NULL,
  row_count       INTEGER NOT NULL,
  run_id          TEXT REFERENCES runs(id)
);

-- Build: one startup per real company. The id is a readable slug that never changes.
CREATE TABLE startups (
  id                 TEXT PRIMARY KEY,
  -- the entry the values below were read from
  entry_id           TEXT NOT NULL REFERENCES entries(id),
  name               TEXT NOT NULL,
  description        TEXT,
  sector             TEXT,
  website            TEXT,
  domain             TEXT,
  founders_json      TEXT NOT NULL DEFAULT '[]',
  cohort             TEXT,
  cohort_date        TEXT,
  creation_year      INTEGER,
  -- only when the registry lists the startup more than once: field -> id of the other entry that filled a gap
  filled_json        TEXT NOT NULL DEFAULT '{}',
  -- facts found while building, as [{code, text}]; nothing here waits for a decision
  notes_json         TEXT NOT NULL DEFAULT '[]',
  first_download     INTEGER NOT NULL REFERENCES downloads(id),
  -- older than the newest download = no longer published by the registry
  last_download      INTEGER NOT NULL REFERENCES downloads(id),
  website_status     TEXT,
  website_checked_at TEXT,
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL
);

-- Collect: one row per distinct published registry row, verbatim.
-- The id is the start of the SHA-256 of the row's content, so the same published row has the same id
-- in every download, and an edited row is a new entry.
CREATE TABLE entries (
  id             TEXT PRIMARY KEY,
  raw_json       TEXT NOT NULL,
  -- how many times the registry listed this exact row in the last download that had it
  copies         INTEGER NOT NULL DEFAULT 1,
  first_download INTEGER NOT NULL REFERENCES downloads(id),
  last_download  INTEGER NOT NULL REFERENCES downloads(id),
  startup_id     TEXT REFERENCES startups(id)
);

-- Build: every name and website a startup has been published under, so it keeps its id when one of them changes.
CREATE TABLE startup_keys (
  key        TEXT PRIMARY KEY,
  startup_id TEXT NOT NULL REFERENCES startups(id)
);

-- Counted facts a step found, as [{code, count, text}].
ALTER TABLE run_steps ADD COLUMN notes_json TEXT NOT NULL DEFAULT '[]';

CREATE INDEX entries_startup ON entries(startup_id);
CREATE INDEX entries_last ON entries(last_download);
CREATE INDEX startup_keys_startup ON startup_keys(startup_id);
