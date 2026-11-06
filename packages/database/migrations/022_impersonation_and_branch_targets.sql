-- God's-eye platform administration and richer assignment targeting.
--
-- Platform super administrators can impersonate any active user for a short
-- window (sessions.impersonated_by records who is acting). Announcements can
-- target several branches; the empty array means the whole organisation, so
-- existing rows keep their current behaviour.

ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS impersonated_by UUID REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS ix_sessions_impersonated_by ON sessions(impersonated_by);

ALTER TABLE announcements
  ADD COLUMN IF NOT EXISTS branch_ids UUID[] NOT NULL DEFAULT '{}';
