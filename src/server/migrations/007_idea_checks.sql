-- An idea someone typed, and what the registry held about it at that moment.
-- The matches are kept as they were found, so a saved check still says what it said that day.
CREATE TABLE idea_checks (
  id              TEXT PRIMARY KEY,
  idea            TEXT NOT NULL,
  -- en, fr, ar, or NULL when it could not be told
  language        TEXT,
  checked_at      TEXT NOT NULL,
  -- the registry download it was compared with
  download        INTEGER REFERENCES downloads(id),
  -- how many startups had a description to compare with
  compared        INTEGER NOT NULL,
  -- [{startupId, closeness, band}] with band close | far | nearest
  matches_json    TEXT NOT NULL,
  -- [{startupId, same, different}], written by the operator's AI model; NULL until asked
  explained_json  TEXT,
  explained_model TEXT,
  saved           INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idea_checks_at ON idea_checks(checked_at);
