-- Re-EL ECD Database Schema
-- PostgreSQL with UUID primary keys

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  auth_provider VARCHAR(50),
  auth_subject VARCHAR(255),
  email VARCHAR(255) NOT NULL,
  email_normalized VARCHAR(255) NOT NULL,
  display_name VARCHAR(255),
  phone VARCHAR(50),
  avatar_url TEXT,
  status VARCHAR(20) DEFAULT 'active',
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(auth_provider, auth_subject),
  UNIQUE(email_normalized)
);

-- Organisations
CREATE TABLE organisations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) UNIQUE NOT NULL,
  legal_name VARCHAR(255),
  registration_number VARCHAR(100),
  status VARCHAR(20) DEFAULT 'active',
  subscription_status VARCHAR(20) DEFAULT 'trial',
  timezone VARCHAR(50) DEFAULT 'Africa/Johannesburg',
  currency VARCHAR(3) DEFAULT 'ZAR',
  locale VARCHAR(10) DEFAULT 'en-ZA',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Branches
CREATE TABLE branches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL,
  address TEXT,
  contact_email VARCHAR(255),
  contact_phone VARCHAR(50),
  timezone VARCHAR(50) DEFAULT 'Africa/Johannesburg',
  status VARCHAR(20) DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organisation_id, slug)
);

-- Memberships
CREATE TABLE memberships (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  status VARCHAR(20) DEFAULT 'active',
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, organisation_id)
);

-- Roles
CREATE TABLE roles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL,
  role_key VARCHAR(100) UNIQUE NOT NULL,
  scope_type VARCHAR(50) NOT NULL,
  is_system_role BOOLEAN DEFAULT true,
  description TEXT
);

-- Permissions
CREATE TABLE permissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  permission_key VARCHAR(100) UNIQUE NOT NULL,
  resource VARCHAR(50) NOT NULL,
  action VARCHAR(50) NOT NULL,
  scope VARCHAR(50) NOT NULL,
  description TEXT
);

-- Role permissions
CREATE TABLE role_permissions (
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY(role_id, permission_id)
);

-- Membership roles
CREATE TABLE membership_roles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  membership_id UUID NOT NULL REFERENCES memberships(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES branches(id) ON DELETE CASCADE,
  granted_by UUID REFERENCES users(id),
  granted_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  status VARCHAR(20) DEFAULT 'active'
);

-- Learners
CREATE TABLE learners (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  learner_reference VARCHAR(50) NOT NULL,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  preferred_name VARCHAR(100),
  date_of_birth DATE NOT NULL,
  profile_image_key TEXT,
  status VARCHAR(20) DEFAULT 'enrolled',
  enrolment_date DATE,
  departure_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organisation_id, learner_reference)
);

-- Guardians
CREATE TABLE guardians (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id),
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  email VARCHAR(255),
  phone VARCHAR(50),
  status VARCHAR(20) DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Learner guardians
CREATE TABLE learner_guardians (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  learner_id UUID NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  guardian_id UUID NOT NULL REFERENCES guardians(id) ON DELETE CASCADE,
  relationship_type VARCHAR(50) NOT NULL,
  is_primary_contact BOOLEAN DEFAULT false,
  can_collect BOOLEAN DEFAULT true,
  can_receive_reports BOOLEAN DEFAULT true,
  can_receive_financial_information BOOLEAN DEFAULT false,
  portal_access_status VARCHAR(20) DEFAULT 'pending',
  starts_at DATE DEFAULT CURRENT_DATE,
  ends_at DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(learner_id, guardian_id)
);

-- Classrooms
CREATE TABLE classrooms (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  age_group_id UUID,
  configured_capacity INTEGER DEFAULT 0,
  status VARCHAR(20) DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Learner attendance
CREATE TABLE learner_attendance (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  learner_id UUID NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  attendance_date DATE NOT NULL,
  check_in_at TIMESTAMPTZ,
  check_out_at TIMESTAMPTZ,
  attendance_status VARCHAR(20) NOT NULL,
  absence_reason TEXT,
  recorded_by UUID REFERENCES users(id),
  verified_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(learner_id, attendance_date)
);

-- Staff profiles
CREATE TABLE staff_profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id),
  employee_reference VARCHAR(50) NOT NULL,
  job_title VARCHAR(100) NOT NULL,
  employment_status VARCHAR(20) DEFAULT 'active',
  start_date DATE,
  end_date DATE,
  contact_details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organisation_id, employee_reference)
);

-- Audit events
CREATE TABLE audit_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  actor_user_id UUID REFERENCES users(id),
  organisation_id UUID REFERENCES organisations(id),
  branch_id UUID REFERENCES branches(id),
  action VARCHAR(100) NOT NULL,
  resource_type VARCHAR(50) NOT NULL,
  resource_id UUID,
  occurred_at TIMESTAMPTZ DEFAULT NOW(),
  request_id VARCHAR(100),
  metadata JSONB
);

-- Indexes
CREATE INDEX idx_memberships_user_id ON memberships(user_id);
CREATE INDEX idx_memberships_org_id ON memberships(organisation_id);
CREATE INDEX idx_learners_org_branch ON learners(organisation_id, branch_id);
CREATE INDEX idx_learners_status ON learners(status);
CREATE INDEX idx_learner_attendance_date ON learner_attendance(attendance_date);
CREATE INDEX idx_audit_events_org ON audit_events(organisation_id);
CREATE INDEX idx_audit_events_occurred ON audit_events(occurred_at);
