-- Guardians may only ever see medical notes deliberately shared with them
-- ("guardian"), never the centre's internal staff/medical notes. Add the
-- level; nothing changes until a clinician marks a record guardian-visible.
ALTER TABLE learner_medical_records DROP CONSTRAINT IF EXISTS learner_medical_records_visibility_level_check;
ALTER TABLE learner_medical_records
  ADD CONSTRAINT learner_medical_records_visibility_level_check
  CHECK (visibility_level IN ('staff', 'medical', 'restricted', 'guardian'));
