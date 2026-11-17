-- Live checks become assessment evidence, not anonymous poll results.
-- Sessions declare a participant mode; responses link to the roster (or carry
-- nothing at all); unknown legacy ids are nulled out; name-based uniqueness
-- goes; named-mode uniqueness (session, step, child) comes in.

ALTER TABLE presentation_sessions
  ADD COLUMN IF NOT EXISTS participant_mode VARCHAR(20) NOT NULL DEFAULT 'anonymous',
  ADD COLUMN IF NOT EXISTS aggregate_snapshot JSONB;

ALTER TABLE presentation_sessions
  ADD CONSTRAINT presentation_sessions_participant_mode_check
  CHECK (participant_mode IN ('anonymous', 'class_roster'));

-- Null out ids that never referenced real children (they were free-form
-- before; now participant_id is a genuine FK to learners).
UPDATE presentation_responses pr
SET participant_id = NULL
WHERE pr.participant_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM learners l WHERE l.id = pr.participant_id);

-- Drop the name-based uniqueness (auto-generated name from 039).
ALTER TABLE presentation_responses DROP CONSTRAINT IF EXISTS presentation_responses_session_id_step_id_participant_name_key;

ALTER TABLE presentation_responses
  ADD CONSTRAINT presentation_responses_participant_fkey
  FOREIGN KEY (participant_id) REFERENCES learners(id) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS idx_presentation_responses_roster
  ON presentation_responses (session_id, step_id, participant_id)
  WHERE participant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_presentation_responses_learner
  ON presentation_responses (participant_id) WHERE participant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_presentation_responses_org
  ON presentation_responses (organisation_id, created_at);

COMMENT ON TABLE presentation_responses IS
  'Raw answers from live sessions. class_roster sessions hold child-linked rows (purged by scripts/purge-live-checks.mjs after the retention window); anonymous sessions hold no identity at all. Aggregates live on presentation_sessions.aggregate_snapshot.';
COMMENT ON COLUMN presentation_sessions.participant_mode IS
  'anonymous: counts only, never names. class_roster: responses link to learners; every row is a POPIA record of a child.';
