-- Fields organised by what they are: registry facts on startups, people in founders,
-- our own observation of a website in website_checks.

-- One row per founder per startup, in published order. person_key ignores case, accents and
-- word order, so one person under two spellings is one key. Build rewrites these rows.
CREATE TABLE founders (
  startup_id TEXT NOT NULL REFERENCES startups(id) ON DELETE CASCADE,
  position   INTEGER NOT NULL,
  name       TEXT NOT NULL,
  person_key TEXT NOT NULL,
  PRIMARY KEY (startup_id, position)
);
CREATE INDEX founders_person ON founders(person_key);
INSERT INTO founders (startup_id, position, name, person_key)
  SELECT s.id, j.key, trim(j.value), lower(trim(j.value)) FROM startups s, json_each(s.founders_json) j WHERE trim(j.value) <> '';

-- The month the startup received its label, as YYYY-MM. It replaces cohort ('MM/YYYY' text) and cohort_date.
ALTER TABLE startups ADD COLUMN labelled TEXT;
UPDATE startups SET labelled = substr(cohort, 4, 4) || '-' || substr(cohort, 1, 2) WHERE cohort IS NOT NULL;

-- Language of the description: en, fr, ar, or NULL when there is none or it is too short to tell.
ALTER TABLE startups ADD COLUMN language TEXT;
-- own (its own domain), hosted (a free site builder), social (a page on a network), shortlink.
ALTER TABLE startups ADD COLUMN website_kind TEXT;

ALTER TABLE startups DROP COLUMN founders_json;
ALTER TABLE startups DROP COLUMN cohort;
ALTER TABLE startups DROP COLUMN cohort_date;
ALTER TABLE startups DROP COLUMN website_status;
ALTER TABLE startups DROP COLUMN website_checked_at;

-- Check: the latest observation of each startup's website. An observation, never a verdict about the company.
CREATE TABLE website_checks (
  startup_id TEXT PRIMARY KEY REFERENCES startups(id) ON DELETE CASCADE,
  -- the address that was requested
  url        TEXT NOT NULL,
  -- reachable | unreachable
  status     TEXT NOT NULL,
  -- what happened, in words: "answered 200", "no such domain", "timed out"
  detail     TEXT NOT NULL,
  -- set when the address led to a different domain
  final_host TEXT,
  checked_at TEXT NOT NULL,
  -- when this status was first observed without interruption
  since      TEXT NOT NULL
);

CREATE INDEX startups_labelled ON startups(labelled);
CREATE INDEX startups_sector ON startups(sector);
