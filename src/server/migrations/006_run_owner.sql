-- The process that owns a run. A restarting server may only call a run interrupted when its owner is gone;
-- a run started by another process (a script, a second server) is left alone while that process lives.
ALTER TABLE runs ADD COLUMN pid INTEGER;
