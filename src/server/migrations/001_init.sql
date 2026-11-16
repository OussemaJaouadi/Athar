-- Athar schema v1: one SQLite file for raw evidence, derived data, runs, keys and vectors.

-- Collect: every download is kept byte for byte.
CREATE TABLE source_snapshots (
  id           TEXT PRIMARY KEY,
  source_id    TEXT NOT NULL,
  url          TEXT NOT NULL,
  fetched_at   TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  byte_size    INTEGER NOT NULL,
  row_count    INTEGER NOT NULL,
  body         BLOB NOT NULL,
  run_id       TEXT REFERENCES runs(id)
);

-- Collect: one row per registry record, verbatim.
CREATE TABLE source_rows (
  id          TEXT PRIMARY KEY,
  snapshot_id TEXT NOT NULL REFERENCES source_snapshots(id),
  row_number  INTEGER NOT NULL,
  raw_json    TEXT NOT NULL,
  UNIQUE (snapshot_id, row_number)
);

-- Clean: one normalized record per source row; changes_json explains every edit.
CREATE TABLE records (
  source_row_id TEXT PRIMARY KEY REFERENCES source_rows(id),
  snapshot_id   TEXT NOT NULL REFERENCES source_snapshots(id),
  name          TEXT NOT NULL,
  description   TEXT,
  sector        TEXT,
  website       TEXT,
  domain        TEXT,
  founders_json TEXT NOT NULL DEFAULT '[]',
  cohort        TEXT,
  cohort_date   TEXT,
  creation_year INTEGER,
  changes_json  TEXT NOT NULL DEFAULT '[]',
  startup_id    TEXT REFERENCES startups(id)
);

-- Merge: one startup per real company; fields cite the record they came from.
CREATE TABLE startups (
  id                 TEXT PRIMARY KEY,
  identity_key       TEXT NOT NULL UNIQUE,
  name               TEXT NOT NULL,
  description        TEXT,
  sector             TEXT,
  website            TEXT,
  domain             TEXT,
  founders_json      TEXT NOT NULL DEFAULT '[]',
  cohort             TEXT,
  creation_year      INTEGER,
  primary_row_id     TEXT REFERENCES source_rows(id),
  first_snapshot_id  TEXT REFERENCES source_snapshots(id),
  latest_snapshot_id TEXT REFERENCES source_snapshots(id),
  website_status     TEXT,
  website_checked_at TEXT,
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL
);

-- Items the pipeline cannot settle alone.
CREATE TABLE review_items (
  id            TEXT PRIMARY KEY,
  source_row_id TEXT REFERENCES source_rows(id),
  startup_id    TEXT REFERENCES startups(id),
  step          TEXT NOT NULL,
  code          TEXT NOT NULL,
  message       TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'open',
  run_id        TEXT REFERENCES runs(id),
  created_at    TEXT NOT NULL
);

-- Runs: every operation and each of its steps, so a reload never loses one.
CREATE TABLE runs (
  id          TEXT PRIMARY KEY,
  operation   TEXT NOT NULL,
  status      TEXT NOT NULL,
  started_at  TEXT NOT NULL,
  finished_at TEXT,
  error       TEXT
);

CREATE TABLE run_steps (
  run_id      TEXT NOT NULL REFERENCES runs(id),
  position    INTEGER NOT NULL,
  step        TEXT NOT NULL,
  status      TEXT NOT NULL,
  started_at  TEXT,
  finished_at TEXT,
  items_in    INTEGER,
  items_out   INTEGER,
  message     TEXT,
  PRIMARY KEY (run_id, position)
);

-- Keys: AI provider credentials managed in the operator portal.
CREATE TABLE ai_keys (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE,
  provider   TEXT NOT NULL,
  model      TEXT NOT NULL,
  api_key    TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE ai_usage (
  id            TEXT PRIMARY KEY,
  key_id        TEXT REFERENCES ai_keys(id),
  run_id        TEXT REFERENCES runs(id),
  input_tokens  INTEGER,
  output_tokens INTEGER,
  outcome       TEXT NOT NULL,
  created_at    TEXT NOT NULL
);

-- Prepare: cleaned retrieval text, kept beside the original description.
CREATE TABLE prepared_texts (
  startup_id   TEXT PRIMARY KEY REFERENCES startups(id),
  input_hash   TEXT NOT NULL,
  language     TEXT,
  text         TEXT NOT NULL,
  removed_json TEXT NOT NULL DEFAULT '[]',
  key_id       TEXT REFERENCES ai_keys(id),
  model        TEXT,
  created_at   TEXT NOT NULL
);

-- Embed: Qwen3-Embedding-0.6B vectors (1024 dims) searched by sqlite-vec.
CREATE VIRTUAL TABLE startup_vectors USING vec0(
  startup_id TEXT PRIMARY KEY,
  embedding  float[1024] distance_metric=cosine
);

CREATE TABLE embedding_meta (
  startup_id TEXT PRIMARY KEY REFERENCES startups(id),
  model      TEXT NOT NULL,
  revision   TEXT NOT NULL,
  dims       INTEGER NOT NULL,
  text_hash  TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- Search without embeddings: full-text over startups, refreshed by Merge.
CREATE VIRTUAL TABLE startups_fts USING fts5(
  startup_id UNINDEXED,
  name,
  description,
  sector,
  tokenize = 'unicode61 remove_diacritics 2'
);

CREATE INDEX records_startup ON records(startup_id);
CREATE INDEX source_rows_snapshot ON source_rows(snapshot_id);
CREATE INDEX review_items_status ON review_items(status);
CREATE INDEX run_steps_run ON run_steps(run_id);
