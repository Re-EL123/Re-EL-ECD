-- 004: observations, assessments, portfolios and daily reports
CREATE TABLE learner_observations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  learner_id UUID NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  objective_id UUID REFERENCES learning_objectives(id) ON DELETE SET NULL,
  observation_date DATE NOT NULL DEFAULT CURRENT_DATE,
  context VARCHAR(120),
  observation_text TEXT NOT NULL,
  assessment_status VARCHAR(20) NOT NULL DEFAULT 'draft'
    CHECK (assessment_status IN ('draft','submitted','reviewed','published','amended')),
  visibility_status VARCHAR(20) NOT NULL DEFAULT 'internal'
    CHECK (visibility_status IN ('internal','guardians','published')),
  recorded_by UUID REFERENCES users(id),
  reviewed_by UUID REFERENCES users(id),
  published_at TIMESTAMPTZ,
  amended_from UUID REFERENCES learner_observations(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_observations_learner ON learner_observations(learner_id, observation_date);

CREATE TABLE assessment_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  name VARCHAR(120) NOT NULL,
  starts_on DATE NOT NULL,
  ends_on DATE NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('planned','active','closed'))
);

CREATE TABLE learner_assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  learner_id UUID NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  assessment_period_id UUID NOT NULL REFERENCES assessment_periods(id) ON DELETE CASCADE,
  domain_id UUID REFERENCES curriculum_domains(id) ON DELETE SET NULL,
  assessment_status VARCHAR(20) NOT NULL DEFAULT 'draft'
    CHECK (assessment_status IN ('draft','submitted','reviewed','published','amended')),
  summary TEXT,
  assessed_by UUID REFERENCES users(id),
  reviewed_by UUID REFERENCES users(id),
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (learner_id, assessment_period_id, domain_id)
);

CREATE TABLE learner_portfolio_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  learner_id UUID NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  activity_id UUID REFERENCES activities(id) ON DELETE SET NULL,
  title VARCHAR(200) NOT NULL,
  description TEXT,
  storage_key TEXT,
  media_type VARCHAR(100),
  sharing_status VARCHAR(20) NOT NULL DEFAULT 'private'
    CHECK (sharing_status IN ('private','staff','guardians','public')),
  uploaded_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE daily_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  learner_id UUID NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  report_date DATE NOT NULL DEFAULT CURRENT_DATE,
  mood VARCHAR(40),
  meals TEXT,
  naps TEXT,
  toileting TEXT,
  activities_summary TEXT,
  notes TEXT,
  shared_with_guardians BOOLEAN NOT NULL DEFAULT false,
  recorded_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (learner_id, report_date)
);
