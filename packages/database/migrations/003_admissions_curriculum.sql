-- 003: admissions, enrolment, curriculum and delivery
CREATE TABLE admission_enquiries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  guardian_name VARCHAR(200) NOT NULL,
  guardian_email VARCHAR(255) NOT NULL,
  guardian_phone VARCHAR(50),
  child_name VARCHAR(200),
  child_date_of_birth DATE,
  requested_age_group VARCHAR(60),
  preferred_start_date DATE,
  message TEXT,
  source VARCHAR(40) NOT NULL DEFAULT 'website',
  status VARCHAR(20) NOT NULL DEFAULT 'new' CHECK (status IN ('new','contacted','converted','closed','spam')),
  assigned_to UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_enquiries_org ON admission_enquiries(organisation_id, status);

CREATE TABLE admission_applications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  enquiry_id UUID REFERENCES admission_enquiries(id) ON DELETE SET NULL,
  application_reference VARCHAR(60) NOT NULL,
  child_first_name VARCHAR(100) NOT NULL,
  child_last_name VARCHAR(100) NOT NULL,
  child_date_of_birth DATE NOT NULL,
  guardian_name VARCHAR(200) NOT NULL,
  guardian_email VARCHAR(255) NOT NULL,
  guardian_phone VARCHAR(50),
  requested_classroom_id UUID REFERENCES classrooms(id),
  preferred_start_date DATE,
  notes TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('submitted','under_review','approved','waitlisted','rejected','enrolled')),
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  decision_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organisation_id, application_reference)
);

CREATE TABLE enrolments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  learner_id UUID NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  classroom_id UUID REFERENCES classrooms(id),
  start_date DATE NOT NULL,
  end_date DATE,
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active','transferred','withdrawn','completed')),
  fee_plan_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE curriculum_frameworks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organisation_id UUID REFERENCES organisations(id) ON DELETE CASCADE,
  name VARCHAR(200) NOT NULL,
  version VARCHAR(40) NOT NULL DEFAULT '1.0',
  description TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE curriculum_domains (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  framework_id UUID NOT NULL REFERENCES curriculum_frameworks(id) ON DELETE CASCADE,
  name VARCHAR(150) NOT NULL,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE learning_objectives (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  domain_id UUID NOT NULL REFERENCES curriculum_domains(id) ON DELETE CASCADE,
  age_group VARCHAR(60),
  code VARCHAR(40) NOT NULL,
  description TEXT NOT NULL,
  expected_observation_context TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived'))
);

CREATE TABLE academic_periods (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES branches(id) ON DELETE CASCADE,
  name VARCHAR(120) NOT NULL,
  period_type VARCHAR(40) NOT NULL DEFAULT 'term',
  starts_on DATE NOT NULL,
  ends_on DATE NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('planned','active','closed'))
);

CREATE TABLE lesson_plans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  classroom_id UUID REFERENCES classrooms(id),
  academic_period_id UUID REFERENCES academic_periods(id),
  title VARCHAR(200) NOT NULL,
  theme VARCHAR(150),
  objective_ids JSONB NOT NULL DEFAULT '[]',
  preparation_notes TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','submitted','approved','published','in_progress','completed','evaluated','cancelled')),
  created_by UUID REFERENCES users(id),
  approved_by UUID REFERENCES users(id),
  published_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  delivery_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE activities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  title VARCHAR(200) NOT NULL,
  description TEXT,
  age_group VARCHAR(60),
  duration_minutes INTEGER NOT NULL DEFAULT 30,
  materials TEXT,
  safety_notes TEXT,
  activity_type VARCHAR(60) NOT NULL DEFAULT 'creative',
  created_by UUID REFERENCES users(id),
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE scheduled_activities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  classroom_id UUID REFERENCES classrooms(id),
  lesson_plan_id UUID REFERENCES lesson_plans(id) ON DELETE SET NULL,
  activity_id UUID REFERENCES activities(id) ON DELETE SET NULL,
  title VARCHAR(200) NOT NULL,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ,
  assigned_staff_id UUID,
  status VARCHAR(30) NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled','in_progress','completed','cancelled')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_scheduled_org_date ON scheduled_activities(organisation_id, starts_at);

CREATE TABLE activity_participation (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  scheduled_activity_id UUID NOT NULL REFERENCES scheduled_activities(id) ON DELETE CASCADE,
  learner_id UUID NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  participation_status VARCHAR(30) NOT NULL DEFAULT 'participated'
    CHECK (participation_status IN ('participated','partial','absent','not_observed')),
  observation_summary TEXT,
  recorded_by UUID REFERENCES users(id),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (scheduled_activity_id, learner_id)
);
