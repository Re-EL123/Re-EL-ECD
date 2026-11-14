-- ============================================================================
-- The Gate — one QR, one scan, one tap. Transport drivers and family collectors
-- are the same verified people in the same table; the only difference is a tag.
-- ============================================================================

-- Collector type: 'family' for a parent/grandparent/carer, 'driver' for a
-- registered monthly/cab transport driver. Same sign-in, same gate.
ALTER TABLE authorised_collectors
  ADD COLUMN IF NOT EXISTS collector_type VARCHAR(30) NOT NULL DEFAULT 'family',
  ADD COLUMN IF NOT EXISTS vehicle_description TEXT,
  ADD COLUMN IF NOT EXISTS licence_plate VARCHAR(30),
  ADD COLUMN IF NOT EXISTS vehicle_make_model VARCHAR(200),
  ADD COLUMN IF NOT EXISTS driver_photo_url TEXT,
  ADD COLUMN IF NOT EXISTS pkid_standing_slot BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS pkid_pickup_days TEXT[],
  ADD COLUMN IF NOT EXISTS pin_hash TEXT,
  ADD COLUMN IF NOT EXISTS pin_created_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pin_last_used_at TIMESTAMPTZ;
-- Simple phone sign-in for the gate: name + 6-digit PIN. No email required.
CREATE INDEX IF NOT EXISTS ix_collectors_gate_lookup ON authorised_collectors (organisation_id, lower(name)) WHERE status = 'active' AND approval_status = 'approved';

-- Audit of every gate scan (arrival log).
CREATE TABLE IF NOT EXISTS gate_scans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  collector_id UUID REFERENCES authorised_collectors(id) ON DELETE SET NULL,
  collector_name TEXT NOT NULL,
  collector_type VARCHAR(30) NOT NULL DEFAULT 'family',
  learner_id UUID NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  confirmed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  released_at TIMESTAMPTZ,
  released_by UUID REFERENCES users(id)
);
CREATE INDEX ix_gate_scans_current ON gate_scans(learner_id, confirmed_at) WHERE released_at IS NULL;
CREATE INDEX ix_gate_scans_org_date ON gate_scans(organisation_id, confirmed_at);

-- Driver directory for parents to browse regular and ad-hoc transport.
-- Re-uses authorised_collectors (one table, driver-filtered views) so a parent
-- can register a driver the same way they add a carer.
CREATE OR REPLACE VIEW gate_drivers AS
  SELECT ac.id, ac.organisation_id, ac.learner_id, ac.name, ac.relationship,
         ac.contact_phone, ac.collector_type, ac.vehicle_description,
         ac.vehicle_make_model, ac.licence_plate, ac.driver_photo_url,
         ac.pkid_standing_slot, ac.pkid_pickup_days, ac.status, ac.is_trusted,
         ac.approval_status, ac.created_by, ac.created_at
  FROM authorised_collectors ac
  WHERE ac.collector_type IN ('driver','taxi');
