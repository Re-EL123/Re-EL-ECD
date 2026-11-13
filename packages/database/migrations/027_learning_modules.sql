-- Learning modules: a first-class, sequenced container for lesson plans built
-- around a theme and an age group. Plans belong to at most one module at a
-- time and carry their position inside the module.
CREATE TABLE learning_modules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  title VARCHAR(180) NOT NULL,
  description TEXT,
  theme VARCHAR(120),
  age_group VARCHAR(60),
  duration_weeks INTEGER CHECK (duration_weeks IS NULL OR (duration_weeks >= 1 AND duration_weeks <= 52)),
  status VARCHAR(30) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE lesson_plans
  ADD COLUMN IF NOT EXISTS module_id UUID REFERENCES learning_modules(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS module_position INTEGER;
CREATE INDEX ix_learning_modules_org ON learning_modules(organisation_id, status);
CREATE INDEX ix_lesson_plans_module ON lesson_plans(module_id);
