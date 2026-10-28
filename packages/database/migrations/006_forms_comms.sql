-- 006: forms, consent, communications and notifications
CREATE TABLE form_definitions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  name VARCHAR(200) NOT NULL,
  slug VARCHAR(120) NOT NULL,
  form_type VARCHAR(40) NOT NULL DEFAULT 'general',
  description TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  current_version_id UUID,
  is_public BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organisation_id, slug)
);

CREATE TABLE form_versions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  form_definition_id UUID NOT NULL REFERENCES form_definitions(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  schema_json JSONB NOT NULL DEFAULT '{"fields":[]}',
  published_at TIMESTAMPTZ,
  published_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (form_definition_id, version_number)
);

CREATE TABLE form_submissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  form_definition_id UUID NOT NULL REFERENCES form_definitions(id) ON DELETE CASCADE,
  form_version_id UUID NOT NULL REFERENCES form_versions(id) ON DELETE CASCADE,
  submitted_by_user_id UUID REFERENCES users(id),
  related_learner_id UUID REFERENCES learners(id) ON DELETE SET NULL,
  submission_data JSONB NOT NULL DEFAULT '{}',
  status VARCHAR(20) NOT NULL DEFAULT 'received'
    CHECK (status IN ('received','under_review','approved','rejected','archived')),
  submitter_email VARCHAR(255),
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT
);

CREATE TABLE consent_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  learner_id UUID REFERENCES learners(id) ON DELETE CASCADE,
  guardian_id UUID REFERENCES guardians(id) ON DELETE SET NULL,
  consent_type VARCHAR(80) NOT NULL,
  purpose TEXT NOT NULL,
  form_version_id UUID REFERENCES form_versions(id),
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('granted','withdrawn','pending')),
  granted_at TIMESTAMPTZ,
  withdrawn_at TIMESTAMPTZ,
  recorded_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE announcements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES branches(id) ON DELETE CASCADE,
  title VARCHAR(200) NOT NULL,
  body TEXT NOT NULL,
  audience_type VARCHAR(30) NOT NULL DEFAULT 'all'
    CHECK (audience_type IN ('all','staff','parents','guardians','teachers')),
  status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  published_at TIMESTAMPTZ,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  subject VARCHAR(200),
  conversation_type VARCHAR(30) NOT NULL DEFAULT 'direct'
    CHECK (conversation_type IN ('direct','group','classroom')),
  related_learner_id UUID REFERENCES learners(id) ON DELETE SET NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE conversation_participants (
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  participant_role VARCHAR(30) NOT NULL DEFAULT 'member',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  left_at TIMESTAMPTZ,
  last_read_at TIMESTAMPTZ,
  PRIMARY KEY (conversation_id, user_id)
);

CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_user_id UUID NOT NULL REFERENCES users(id),
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  edited_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ
);

CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organisation_id UUID REFERENCES organisations(id) ON DELETE CASCADE,
  recipient_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  notification_type VARCHAR(60) NOT NULL DEFAULT 'general',
  title VARCHAR(200) NOT NULL,
  body TEXT,
  related_resource_type VARCHAR(60),
  related_resource_id UUID,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_notifications_recipient ON notifications(recipient_user_id, read_at);

CREATE TABLE notification_deliveries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  notification_id UUID NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  channel VARCHAR(20) NOT NULL CHECK (channel IN ('in_app','email','sms')),
  delivery_status VARCHAR(20) NOT NULL DEFAULT 'queued'
    CHECK (delivery_status IN ('queued','sent','delivered','failed','skipped')),
  provider_reference VARCHAR(200),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_attempt_at TIMESTAMPTZ,
  last_error TEXT
);
