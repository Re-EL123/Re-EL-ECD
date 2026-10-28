-- 008: safety, tasks, website, platform billing, audit and jobs
CREATE TABLE incidents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  incident_type VARCHAR(80) NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  location_description VARCHAR(200),
  description TEXT NOT NULL,
  severity VARCHAR(20) NOT NULL DEFAULT 'low' CHECK (severity IN ('low','medium','high','critical')),
  status VARCHAR(20) NOT NULL DEFAULT 'reported'
    CHECK (status IN ('reported','reviewed','action_assigned','follow_up','closed')),
  restricted BOOLEAN NOT NULL DEFAULT false,
  reported_by UUID REFERENCES users(id),
  reviewed_by UUID REFERENCES users(id),
  guardian_notified_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE incident_participants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  incident_id UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  participant_type VARCHAR(30) NOT NULL CHECK (participant_type IN ('learner','staff','guardian','other')),
  participant_id UUID,
  involvement_type VARCHAR(60) NOT NULL DEFAULT 'involved'
);

CREATE TABLE incident_actions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  incident_id UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  action_description TEXT NOT NULL,
  assigned_to UUID REFERENCES users(id),
  due_at DATE,
  completed_at TIMESTAMPTZ,
  status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','done','cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES branches(id) ON DELETE CASCADE,
  title VARCHAR(200) NOT NULL,
  description TEXT,
  assigned_to UUID REFERENCES users(id),
  priority VARCHAR(20) NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high','urgent')),
  due_at DATE,
  status VARCHAR(20) NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','in_progress','blocked','done','cancelled')),
  source VARCHAR(40) NOT NULL DEFAULT 'manual',
  related_resource_type VARCHAR(60),
  related_resource_id UUID,
  created_by UUID REFERENCES users(id),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_tasks_org_status ON tasks(organisation_id, status);

CREATE TABLE task_comments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  author_user_id UUID NOT NULL REFERENCES users(id),
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE website_configs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES branches(id) ON DELETE CASCADE,
  slug VARCHAR(120) NOT NULL UNIQUE,
  theme VARCHAR(40) NOT NULL DEFAULT 'nature',
  published_content JSONB NOT NULL DEFAULT '{}',
  draft_content JSONB NOT NULL DEFAULT '{}',
  status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','unpublished')),
  published_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE domains (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  domain_name VARCHAR(255) NOT NULL UNIQUE,
  verification_status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (verification_status IN ('pending','verified','failed')),
  ssl_status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (ssl_status IN ('pending','active','failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE subscription_plans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(120) NOT NULL,
  plan_key VARCHAR(60) NOT NULL UNIQUE,
  monthly_price NUMERIC(10,2) NOT NULL DEFAULT 0,
  currency VARCHAR(3) NOT NULL DEFAULT 'ZAR',
  max_learners INTEGER NOT NULL DEFAULT 50,
  max_staff INTEGER NOT NULL DEFAULT 10,
  features JSONB NOT NULL DEFAULT '[]',
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived'))
);

CREATE TABLE platform_subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  plan_id UUID REFERENCES subscription_plans(id),
  status VARCHAR(20) NOT NULL DEFAULT 'trial'
    CHECK (status IN ('trial','active','past_due','cancelled')),
  billing_period VARCHAR(20) NOT NULL DEFAULT 'monthly',
  current_period_start DATE,
  current_period_end DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE audit_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  actor_user_id UUID REFERENCES users(id),
  organisation_id UUID REFERENCES organisations(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
  action VARCHAR(100) NOT NULL,
  resource_type VARCHAR(60) NOT NULL,
  resource_id UUID,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  request_id VARCHAR(100),
  ip_address VARCHAR(64),
  metadata JSONB NOT NULL DEFAULT '{}'
);
CREATE INDEX ix_audit_org_time ON audit_events(organisation_id, occurred_at);
CREATE INDEX ix_audit_action ON audit_events(action);

CREATE TABLE idempotency_keys (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organisation_id UUID REFERENCES organisations(id) ON DELETE CASCADE,
  key VARCHAR(200) NOT NULL,
  user_id UUID REFERENCES users(id),
  request_hash VARCHAR(128),
  response_status INTEGER,
  response_body JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organisation_id, key)
);

CREATE TABLE jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organisation_id UUID REFERENCES organisations(id) ON DELETE CASCADE,
  job_type VARCHAR(80) NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  status VARCHAR(20) NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','running','completed','failed','cancelled')),
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  next_retry_at TIMESTAMPTZ,
  last_error TEXT,
  idempotency_key VARCHAR(150),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE automation_rules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  name VARCHAR(150) NOT NULL,
  trigger_event VARCHAR(120) NOT NULL,
  conditions JSONB NOT NULL DEFAULT '{}',
  action JSONB NOT NULL DEFAULT '{}',
  active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE report_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  report_key VARCHAR(80) NOT NULL,
  parameters JSONB NOT NULL DEFAULT '{}',
  status VARCHAR(20) NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','running','completed','failed')),
  requested_by UUID REFERENCES users(id),
  result_storage_key TEXT,
  row_count INTEGER,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);
