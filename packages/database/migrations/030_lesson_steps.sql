-- Step-by-step lesson guides for multimedia lesson plans. Steps are ordered
-- children-experience-first text/song/story/activity blocks, with optional
-- media URLs for audio, video, images and digital books. NULL organisation
-- mirrors the official-content convention used everywhere else.
CREATE TABLE lesson_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID REFERENCES organisations(id) ON DELETE CASCADE,
  lesson_plan_id UUID NOT NULL REFERENCES lesson_plans(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  step_type VARCHAR(20) NOT NULL CHECK (step_type IN ('intro', 'text', 'song', 'rhyme', 'story', 'activity', 'reflection', 'audio', 'video', 'image', 'book')),
  title VARCHAR(200),
  body TEXT,
  media_url TEXT,
  duration_minutes INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX ix_lesson_steps_plan_position ON lesson_steps(lesson_plan_id, position);
CREATE INDEX ix_lesson_steps_org ON lesson_steps(organisation_id) WHERE organisation_id IS NULL;
