-- When a tenant first crosses a plan limit, we allow a 7-day grace window so
-- nobody is cut off mid-day. After that, new learners/staff/uploads are
-- blocked until the tenant upgrades. Rows are removed automatically when
-- usage falls back under the limit.
CREATE TABLE IF NOT EXISTS plan_limit_grace (
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  kind VARCHAR(20) NOT NULL CHECK (kind IN ('learners', 'staff', 'storage')),
  breached_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (organisation_id, kind)
);
