-- Tenant data exports: asynchronously generated, stored in the backup bucket,
-- and delivered by a signed link that expires after 24 hours.
CREATE TABLE IF NOT EXISTS data_exports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  requested_by UUID REFERENCES users(id) ON DELETE SET NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','processing','ready','failed','expired')),
  reason VARCHAR(24) NOT NULL DEFAULT 'manual'
    CHECK (reason IN ('manual','scheduled','termination')),
  file_key TEXT,
  file_bytes BIGINT,
  entity_count INT NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS ix_data_exports_org ON data_exports(organisation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_data_exports_pending ON data_exports(status, created_at);
