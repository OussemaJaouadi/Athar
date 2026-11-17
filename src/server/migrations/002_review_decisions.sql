-- Review decisions keep their reason and time: a note, when it was decided, and by which role.
ALTER TABLE review_items ADD COLUMN note TEXT;
ALTER TABLE review_items ADD COLUMN decided_at TEXT;
ALTER TABLE review_items ADD COLUMN decided_by TEXT;
