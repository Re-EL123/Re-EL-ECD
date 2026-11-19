-- Track the lesson/block that produced an observation so a lesson can be
-- shared with families exactly once per child, even after a silent refresh.
ALTER TABLE learner_observations
  ADD COLUMN IF NOT EXISTS source_type VARCHAR(40),
  ADD COLUMN IF NOT EXISTS source_id UUID;

-- A plain unique index is required as the ON CONFLICT arbiter (a partial
-- index cannot be used). NULL source columns stay distinct, so ordinary
-- observations are unaffected.
DROP INDEX IF EXISTS ix_learner_observations_source;
CREATE UNIQUE INDEX ix_learner_observations_source
  ON learner_observations (source_type, source_id, learner_id);
