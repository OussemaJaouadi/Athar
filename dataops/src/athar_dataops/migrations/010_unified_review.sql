-- Keep the open-finding filter and record count efficient on existing databases.
CREATE INDEX IF NOT EXISTS idx_review_open
ON entity_review_items(category, resolved, source_row_id);
