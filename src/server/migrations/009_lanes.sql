-- 009: lanes. Every derived value says how it was reached, and the uncertain ones wait for one decision.

-- Standard display forms beside what the registry published. NULL means "same as published".
ALTER TABLE startups ADD COLUMN display_name TEXT;
ALTER TABLE startups ADD COLUMN legal_form TEXT;
ALTER TABLE founders ADD COLUMN display_name TEXT;

-- What a website check means, and what the site says about itself.
-- state: answers | moved | parked | elsewhere | silent | unrelated
ALTER TABLE website_checks ADD COLUMN state TEXT;
ALTER TABLE website_checks ADD COLUMN state_lane TEXT;
ALTER TABLE website_checks ADD COLUMN state_why TEXT;
ALTER TABLE website_checks ADD COLUMN title TEXT;
ALTER TABLE website_checks ADD COLUMN summary TEXT;

-- One row per derived value or link worth explaining. Rebuilt by rule on every Build.
CREATE TABLE readings (
  id      TEXT PRIMARY KEY,   -- "<kind>:<subject>" or "<kind>:<subject>:<part>"; stable across rebuilds
  kind    TEXT NOT NULL,      -- name | alias | founder | person | person_pair | relation | website
  subject TEXT NOT NULL,      -- startup id, "<startup id>#<position>", person key, or "a|b" for a pair (sorted)
  value   TEXT NOT NULL,      -- JSON
  lane    TEXT NOT NULL,      -- rule | inferred | review
  rule    TEXT NOT NULL,
  why     TEXT NOT NULL,
  basis   TEXT NOT NULL       -- hash of the published content this reading rests on
);
CREATE INDEX readings_lane ON readings(lane, kind);
CREATE INDEX readings_subject ON readings(subject);

-- An operator's answer to one reading. It holds while the reading's basis is unchanged; a changed basis reopens it.
CREATE TABLE decisions (
  reading_id TEXT PRIMARY KEY,
  basis      TEXT NOT NULL,
  value      TEXT NOT NULL,   -- JSON
  note       TEXT,
  decided_at TEXT NOT NULL
);

-- What the person running Athar knows that the registry does not. Shown beside registry values, never mixed in.
CREATE TABLE startup_notes (
  id         TEXT PRIMARY KEY,
  startup_id TEXT NOT NULL REFERENCES startups(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL,   -- closed | acquired | agency | renamed | note
  text       TEXT NOT NULL,
  source     TEXT,
  on_date    TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX startup_notes_startup ON startup_notes(startup_id);
