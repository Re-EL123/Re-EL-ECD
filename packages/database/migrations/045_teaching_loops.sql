-- 045 — Teaching loops: guide resume positions, the teaching-session ledger,
-- and whiteboard ↔ plan/step linkage.

-- 1) Guide resume positions (per user, per plan). Small hot table; upsert on every step change.
CREATE TABLE IF NOT EXISTS guide_positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lesson_plan_id UUID NOT NULL REFERENCES lesson_plans(id) ON DELETE CASCADE,
  step_index INTEGER NOT NULL DEFAULT 0,
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organisation_id, user_id, lesson_plan_id)
);
CREATE INDEX IF NOT EXISTS ix_guide_positions_user_plan
  ON guide_positions (user_id, lesson_plan_id);
CREATE INDEX IF NOT EXISTS ix_guide_positions_org_plan
  ON guide_positions (organisation_id, lesson_plan_id, completed_at);

-- 2) Teaching-session ledger: what was actually taught, where and when.
-- Append-only. 'start' when a guide opens; 'resume' when a saved position is used;
-- 'complete' when the guide reaches the final slide.
CREATE TABLE IF NOT EXISTS teaching_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  lesson_plan_id UUID NOT NULL REFERENCES lesson_plans(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  classroom_id UUID REFERENCES classrooms(id) ON DELETE SET NULL,
  scheduled_activity_id UUID REFERENCES scheduled_activities(id) ON DELETE SET NULL,
  mode VARCHAR(20) NOT NULL CHECK (mode IN ('start', 'resume', 'complete')),
  step_index INTEGER,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_teaching_sessions_org_plan
  ON teaching_sessions (organisation_id, lesson_plan_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS ix_teaching_sessions_org_day
  ON teaching_sessions (organisation_id, occurred_at DESC);

-- 3) Whiteboard ↔ step link: board created from a guide step knows which step.
ALTER TABLE whiteboards
  ADD COLUMN IF NOT EXISTS lesson_step_id UUID REFERENCES lesson_steps(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS ix_whiteboards_step ON whiteboards (lesson_step_id)
  WHERE lesson_step_id IS NOT NULL;
