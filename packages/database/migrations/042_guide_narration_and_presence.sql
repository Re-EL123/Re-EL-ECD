-- Lesson guide player: per-step narration audio and live co-presence so
-- teachers see who else is on the same step of the guide during a lesson.

ALTER TABLE lesson_steps
  ADD COLUMN IF NOT EXISTS narration_url TEXT;

COMMENT ON COLUMN lesson_steps.narration_url IS
  'Narration audio for this guide step, played in the lesson guide player.';

CREATE TABLE IF NOT EXISTS guide_presence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID REFERENCES organisations(id) ON DELETE CASCADE,
  lesson_plan_id UUID NOT NULL REFERENCES lesson_plans(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  step_index INTEGER NOT NULL DEFAULT 0,
  seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (lesson_plan_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_guide_presence_org
  ON guide_presence (organisation_id, seen_at DESC);

CREATE INDEX IF NOT EXISTS idx_guide_presence_plan
  ON guide_presence (lesson_plan_id, seen_at DESC);

COMMENT ON TABLE guide_presence IS
  'Live co-presence heartbeats for the lesson guide player; a row per user per plan, refreshed every 15s while a guide is open.';
