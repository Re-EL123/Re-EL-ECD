-- Organisations can correct inaccurate records without silently rewriting
-- history. A correction keeps the previous and proposed values plus the
-- reason, and is applied only after an authorised approver signs it off.
CREATE TABLE IF NOT EXISTS record_corrections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  resource_type VARCHAR(40) NOT NULL CHECK (resource_type IN
    ('learner', 'learner_medical', 'learner_attendance', 'form_submission', 'daily_report')),
  resource_id UUID NOT NULL,
  reason TEXT NOT NULL,
  changes JSONB NOT NULL DEFAULT '{}',
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  requested_by UUID NOT NULL REFERENCES users(id),
  approved_by UUID REFERENCES users(id),
  resolution_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS ix_record_corrections_org_status
  ON record_corrections(organisation_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_record_corrections_resource
  ON record_corrections(organisation_id, resource_type, resource_id);

-- Add the two new permissions to the production catalogue and grant them.
-- The code catalogue (packages/auth/permissions.js) remains the source of truth.
INSERT INTO permissions (permission_key, resource, action, scope)
VALUES ('records.correct.daycare', 'records', 'correct', 'daycare'),
       ('records.approve.daycare', 'records', 'approve', 'daycare')
ON CONFLICT (permission_key) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r CROSS JOIN permissions p
WHERE p.permission_key IN ('records.correct.daycare', 'records.approve.daycare')
  AND (
    r.role_key IN ('organisation_owner', 'principal')
    OR (r.role_key IN ('daycare_administrator', 'daycare_manager')
        AND p.permission_key = 'records.correct.daycare')
  )
ON CONFLICT DO NOTHING;
