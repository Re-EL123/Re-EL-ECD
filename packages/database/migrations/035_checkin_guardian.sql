-- ============================================================================
-- Drop-off identity: who brought the child in the morning. Same collector
-- list, same trust semantics — the gate works at both ends of the day.
-- ============================================================================

ALTER TABLE learner_attendance
  ADD COLUMN IF NOT EXISTS brought_by_collector_id UUID REFERENCES authorised_collectors(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS brought_by_guardian_id UUID REFERENCES guardians(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS brought_by_name TEXT,
  ADD COLUMN IF NOT EXISTS brought_by_unverified BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS ix_attendance_brought_by ON learner_attendance(brought_by_collector_id);
-- Existing rows and bulk-marked rows stay "unverified" — that is the honest
-- answer until someone touches them.
UPDATE learner_attendance SET brought_by_unverified = TRUE WHERE brought_by_name IS NULL AND check_in_at IS NOT NULL;
