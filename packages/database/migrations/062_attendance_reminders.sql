-- One reminder of each kind per staff member per day. This prevents the
-- quarter-hourly cron from sending the same nudge repeatedly.
CREATE TABLE IF NOT EXISTS attendance_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES staff_profiles(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  kind VARCHAR(24) NOT NULL CHECK (kind IN ('clock_in','break','clock_out')),
  sent_on DATE NOT NULL DEFAULT CURRENT_DATE,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  channels JSONB NOT NULL DEFAULT '[]',
  UNIQUE (staff_id, kind, sent_on)
);
CREATE INDEX IF NOT EXISTS ix_attendance_reminders_org_day
  ON attendance_reminders(organisation_id, sent_on DESC);
