-- Official, platform-owned curriculum (the NCF pack) is stored as rows with a
-- NULL organisation_id, mirroring how platform-wide frameworks already work.
-- Tenant adoption copies a row into the org and keeps source attribution.
ALTER TABLE lesson_plans ALTER COLUMN organisation_id DROP NOT NULL;
ALTER TABLE lesson_plans ALTER COLUMN branch_id DROP NOT NULL;
ALTER TABLE activities ALTER COLUMN organisation_id DROP NOT NULL;
ALTER TABLE activities ALTER COLUMN branch_id DROP NOT NULL;
ALTER TABLE learning_modules ALTER COLUMN organisation_id DROP NOT NULL;
ALTER TABLE curriculum_frameworks ADD COLUMN IF NOT EXISTS source VARCHAR(20);
ALTER TABLE curriculum_frameworks ADD COLUMN IF NOT EXISTS source_version VARCHAR(20);
ALTER TABLE curriculum_frameworks ADD COLUMN IF NOT EXISTS source_key VARCHAR(80);
ALTER TABLE learning_modules ADD COLUMN IF NOT EXISTS source VARCHAR(20);
ALTER TABLE learning_modules ADD COLUMN IF NOT EXISTS source_version VARCHAR(20);
ALTER TABLE learning_modules ADD COLUMN IF NOT EXISTS source_key VARCHAR(80);
ALTER TABLE lesson_plans ADD COLUMN IF NOT EXISTS source VARCHAR(20);
ALTER TABLE lesson_plans ADD COLUMN IF NOT EXISTS source_version VARCHAR(20);
ALTER TABLE lesson_plans ADD COLUMN IF NOT EXISTS source_key VARCHAR(80);
ALTER TABLE activities ADD COLUMN IF NOT EXISTS source VARCHAR(20);
ALTER TABLE activities ADD COLUMN IF NOT EXISTS source_version VARCHAR(20);
ALTER TABLE activities ADD COLUMN IF NOT EXISTS source_key VARCHAR(80);
CREATE UNIQUE INDEX IF NOT EXISTS ix_official_framework_source ON curriculum_frameworks(source_key) WHERE organisation_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ix_official_module_source ON learning_modules(source_key) WHERE organisation_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ix_official_plan_source ON lesson_plans(source_key) WHERE organisation_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ix_official_activity_source ON activities(source_key) WHERE organisation_id IS NULL;
