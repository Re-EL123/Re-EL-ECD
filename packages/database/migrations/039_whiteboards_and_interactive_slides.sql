-- Interactive whiteboards (infinite digital canvases) and dynamic slide add-ons
-- (live polls, multiple-choice questions, drag-and-drop activities) for lesson
-- presentations. Collaboration/live results are driven by persisted state with
-- client polling (serverless-safe).

-- Extend lesson steps to carry interactive payloads and new interactive types.
ALTER TABLE lesson_steps
  ADD COLUMN IF NOT EXISTS interactive_data JSONB;

ALTER TABLE lesson_steps DROP CONSTRAINT IF EXISTS lesson_steps_step_type_check;
ALTER TABLE lesson_steps
  ADD CONSTRAINT lesson_steps_step_type_check
  CHECK (step_type IN (
    'intro','text','song','rhyme','story','activity','reflection',
    'audio','video','image','book',
    'poll','mcq','dragdrop','whiteboard'
  ));

-- Live/recorded responses for interactive presentation steps (polls, MCQ,
-- drag-and-drop, quick checks). A session groups responses from one run of a
-- lesson/presentation (e.g. a class moment); anonymous/named participants are
-- supported for flexible classroom use.
CREATE TABLE IF NOT EXISTS presentation_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  lesson_plan_id UUID NOT NULL REFERENCES lesson_plans(id) ON DELETE CASCADE,
  title VARCHAR(200),
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active','closed')),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  classroom_id UUID REFERENCES classrooms(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS ix_presentation_sessions_plan ON presentation_sessions(organisation_id, lesson_plan_id, created_at DESC);

CREATE TABLE IF NOT EXISTS presentation_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES presentation_sessions(id) ON DELETE CASCADE,
  step_id UUID NOT NULL REFERENCES lesson_steps(id) ON DELETE CASCADE,
  participant_id UUID, -- optional learner/user id
  participant_name VARCHAR(120),
  response JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (session_id, step_id, participant_name)
);
CREATE INDEX IF NOT EXISTS ix_presentation_responses_session_step ON presentation_responses(session_id, step_id);

-- Interactive whiteboards: infinite digital canvases with persisted state for
-- drawing, annotation, math/science sketching and collaborative problem-solving.
-- `state` holds the canvas document (strokes/shapes/text, viewport). Updates
-- are versioned for polling-based collaboration.
CREATE TABLE IF NOT EXISTS whiteboards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  title VARCHAR(200) NOT NULL,
  description TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  lesson_plan_id UUID REFERENCES lesson_plans(id) ON DELETE SET NULL,
  classroom_id UUID REFERENCES classrooms(id) ON DELETE SET NULL,
  state JSONB NOT NULL DEFAULT '{"objects":[],"viewport":{"x":0,"y":0,"zoom":1},"version":1}'::jsonb,
  version INTEGER NOT NULL DEFAULT 1,
  is_archived BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_whiteboards_org ON whiteboards(organisation_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS ix_whiteboards_plan ON whiteboards(lesson_plan_id);
