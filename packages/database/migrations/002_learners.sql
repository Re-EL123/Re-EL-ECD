-- 002: learners, guardians, medical and collection records
CREATE TABLE classrooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  age_group VARCHAR(60) NOT NULL DEFAULT '3-4 years',
  min_age_months INTEGER DEFAULT 0,
  max_age_months INTEGER DEFAULT 72,
  configured_capacity INTEGER NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (branch_id, name)
);

CREATE TABLE learners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  classroom_id UUID REFERENCES classrooms(id) ON DELETE SET NULL,
  learner_reference VARCHAR(50) NOT NULL,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  preferred_name VARCHAR(100),
  date_of_birth DATE NOT NULL,
  gender VARCHAR(20),
  home_language VARCHAR(60),
  profile_image_key TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'enrolled'
    CHECK (status IN ('applicant','enrolled','waitlisted','withdrawn','completed','archived')),
  enrolment_date DATE,
  departure_date DATE,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organisation_id, learner_reference)
);
CREATE INDEX ix_learners_org_branch ON learners(organisation_id, branch_id);
CREATE INDEX ix_learners_classroom ON learners(classroom_id);

CREATE TABLE learner_classroom_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  learner_id UUID NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  classroom_id UUID REFERENCES classrooms(id),
  started_on DATE NOT NULL,
  ended_on DATE,
  reason TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE guardians (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  email VARCHAR(255),
  phone VARCHAR(50),
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_guardians_org ON guardians(organisation_id);
CREATE INDEX ix_guardians_user ON guardians(user_id);

CREATE TABLE learner_guardians (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  learner_id UUID NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  guardian_id UUID NOT NULL REFERENCES guardians(id) ON DELETE CASCADE,
  relationship_type VARCHAR(50) NOT NULL,
  is_primary_contact BOOLEAN NOT NULL DEFAULT false,
  can_collect BOOLEAN NOT NULL DEFAULT true,
  can_receive_reports BOOLEAN NOT NULL DEFAULT true,
  can_receive_financial_information BOOLEAN NOT NULL DEFAULT true,
  portal_access_status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (portal_access_status IN ('pending','active','suspended','revoked')),
  starts_at DATE NOT NULL DEFAULT CURRENT_DATE,
  ends_at DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (learner_id, guardian_id)
);

CREATE TABLE learner_medical_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  learner_id UUID NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  record_type VARCHAR(60) NOT NULL,
  details TEXT NOT NULL,
  visibility_level VARCHAR(20) NOT NULL DEFAULT 'staff'
    CHECK (visibility_level IN ('staff','medical','restricted')),
  effective_from DATE,
  effective_until DATE,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE authorised_collectors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  learner_id UUID NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  name VARCHAR(200) NOT NULL,
  relationship VARCHAR(80) NOT NULL,
  contact_phone VARCHAR(50),
  identity_verification_policy VARCHAR(120) DEFAULT 'Photo ID required',
  valid_from DATE,
  valid_until DATE,
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active','expired','revoked')),
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE learner_collection_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  learner_id UUID NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  collector_id UUID REFERENCES authorised_collectors(id),
  collector_name VARCHAR(200),
  event_type VARCHAR(30) NOT NULL DEFAULT 'collection' CHECK (event_type IN ('collection','handover','denied')),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  verified_by UUID REFERENCES users(id),
  verification_method VARCHAR(60),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE learner_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  learner_id UUID NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  document_type VARCHAR(80) NOT NULL,
  title VARCHAR(200) NOT NULL,
  storage_key TEXT NOT NULL,
  media_type VARCHAR(100),
  visibility VARCHAR(20) NOT NULL DEFAULT 'guardians'
    CHECK (visibility IN ('staff','guardians','restricted')),
  expires_at DATE,
  uploaded_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
