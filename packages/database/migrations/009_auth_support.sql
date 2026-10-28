-- 009: authentication support and integrity helpers
CREATE TABLE password_resets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(128) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ix_sessions_token ON sessions(token_hash);
CREATE INDEX ix_staff_events_shift ON staff_attendance_events(shift_id);
CREATE INDEX ix_observations_org ON learner_observations(organisation_id, assessment_status);
CREATE INDEX ix_enrolments_learner ON enrolments(learner_id);
CREATE INDEX ix_invoices_learner ON invoices(learner_id);
CREATE INDEX ix_tasks_assignee ON tasks(assigned_to, status);
