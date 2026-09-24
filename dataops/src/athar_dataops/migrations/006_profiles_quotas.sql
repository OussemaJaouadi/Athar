CREATE TABLE profiles (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    provider TEXT NOT NULL DEFAULT 'groq',
    model TEXT NOT NULL,
    fingerprint TEXT NOT NULL,
    disabled INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE dataops_quotas (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    task TEXT NOT NULL DEFAULT 'prepare',
    metric TEXT NOT NULL,
    limit_value REAL NOT NULL,
    period TEXT NOT NULL DEFAULT 'day',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (profile_id, task, metric)
);

CREATE INDEX idx_quotas_profile ON dataops_quotas(profile_id);