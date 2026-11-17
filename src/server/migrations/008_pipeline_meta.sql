-- What the pipeline remembers about itself: which version of the reading rules built the startups.
-- When the rules in the code are newer than the ones recorded here, the startups need a rebuild.
CREATE TABLE pipeline_meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
