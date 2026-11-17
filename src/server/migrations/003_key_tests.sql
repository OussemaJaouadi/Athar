-- Keys: the last test against the provider, so the portal can say when a key was last known to work.
ALTER TABLE ai_keys ADD COLUMN last_tested_at TEXT;
ALTER TABLE ai_keys ADD COLUMN last_test_ok INTEGER;
ALTER TABLE ai_keys ADD COLUMN last_test_message TEXT;
