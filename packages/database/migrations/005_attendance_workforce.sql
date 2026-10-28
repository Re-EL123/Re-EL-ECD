-- 005: learner attendance and staff workforce
CREATE TABLE learner_attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  learner_id UUID NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  attendance_date DATE NOT NULL,
  check_in_at TIMESTAMPTZ,
  check_out_at TIMESTAMPTZ,
  attendance_status VARCHAR(20) NOT NULL
    CHECK (attendance_status IN ('expected','present','late','absent','excused','collected')),
  absence_reason TEXT,
  recorded_by UUID REFERENCES users(id),
  verified_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (learner_id, attendance_date),
  CHECK (check_out_at IS NULL OR check_in_at IS NULL OR check_out_at >= check_in_at)
);
CREATE INDEX ix_learner_attendance_org_date ON learner_attendance(organisation_id, attendance_date);

CREATE TABLE attendance_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  attendance_record_id UUID NOT NULL REFERENCES learner_attendance(id) ON DELETE CASCADE,
  requested_by UUID REFERENCES users(id),
  approved_by UUID REFERENCES users(id),
  reason TEXT NOT NULL,
  previous_values JSONB NOT NULL DEFAULT '{}',
  proposed_values JSONB NOT NULL DEFAULT '{}',
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

CREATE TABLE staff_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  employee_reference VARCHAR(50) NOT NULL,
  job_title VARCHAR(120) NOT NULL,
  employment_status VARCHAR(20) NOT NULL DEFAULT 'active'
    CHECK (employment_status IN ('active','on_leave','suspended','ended')),
  start_date DATE,
  end_date DATE,
  contact_details JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organisation_id, employee_reference)
);
CREATE INDEX ix_staff_org ON staff_profiles(organisation_id);

CREATE TABLE staff_classrooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES staff_profiles(id) ON DELETE CASCADE,
  classroom_id UUID NOT NULL REFERENCES classrooms(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (staff_id, classroom_id)
);

CREATE TABLE staff_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES staff_profiles(id) ON DELETE CASCADE,
  document_type VARCHAR(80) NOT NULL,
  title VARCHAR(200) NOT NULL,
  storage_key TEXT,
  issued_at DATE,
  expires_at DATE,
  verification_status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (verification_status IN ('pending','verified','rejected','expired')),
  verified_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE staff_shifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES staff_profiles(id) ON DELETE CASCADE,
  shift_date DATE NOT NULL,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  break_minutes INTEGER NOT NULL DEFAULT 30,
  assigned_classroom_id UUID REFERENCES classrooms(id),
  status VARCHAR(20) NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('draft','scheduled','approved','completed','cancelled')),
  created_by UUID REFERENCES users(id),
  approved_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);
CREATE INDEX ix_shifts_org_date ON staff_shifts(organisation_id, shift_date);

CREATE TABLE staff_attendance_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES staff_profiles(id) ON DELETE CASCADE,
  shift_id UUID REFERENCES staff_shifts(id) ON DELETE SET NULL,
  event_type VARCHAR(20) NOT NULL CHECK (event_type IN ('clock_in','clock_out','break_start','break_end')),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  client_recorded_at TIMESTAMPTZ,
  source VARCHAR(30) NOT NULL DEFAULT 'web',
  device_reference VARCHAR(120),
  recorded_by UUID REFERENCES users(id),
  approval_status VARCHAR(20) NOT NULL DEFAULT 'recorded'
    CHECK (approval_status IN ('recorded','approved','rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_staff_events_staff ON staff_attendance_events(staff_id, recorded_at);

CREATE TABLE timesheets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES staff_profiles(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  total_minutes INTEGER NOT NULL DEFAULT 0,
  overtime_minutes INTEGER NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','submitted','approved','rejected')),
  approved_by UUID REFERENCES users(id),
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (staff_id, period_start, period_end)
);

CREATE TABLE leave_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES staff_profiles(id) ON DELETE CASCADE,
  leave_type VARCHAR(20) NOT NULL CHECK (leave_type IN ('annual','sick','family','study','unpaid','maternity')),
  starts_on DATE NOT NULL,
  ends_on DATE NOT NULL,
  reason TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','cancelled')),
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (ends_on >= starts_on)
);

CREATE TABLE staff_training_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES staff_profiles(id) ON DELETE CASCADE,
  course_name VARCHAR(200) NOT NULL,
  provider VARCHAR(150),
  completed_on DATE,
  expires_on DATE,
  certificate_storage_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
