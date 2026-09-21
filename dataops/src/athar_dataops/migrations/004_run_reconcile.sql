-- Suppress exact duplicates at the derived layer while keeping raw evidence intact,
-- and persist per-step timing so runs can be reviewed after the session closes.

ALTER TABLE source_rows ADD COLUMN is_duplicate INTEGER NOT NULL DEFAULT 0;
ALTER TABLE normalized_records ADD COLUMN is_duplicate INTEGER NOT NULL DEFAULT 0;

CREATE TABLE run_steps (
    run_id TEXT NOT NULL REFERENCES pipeline_runs(id) ON DELETE CASCADE,
    step_name TEXT NOT NULL,
    status TEXT NOT NULL,
    started_at TEXT,
    completed_at TEXT,
    items_processed INTEGER NOT NULL DEFAULT 0,
    message TEXT,
    PRIMARY KEY (run_id, step_name)
);

CREATE INDEX IF NOT EXISTS idx_run_steps_run ON run_steps(run_id, step_name);