-- ============================================================================
-- The Collection Gate: proof, process and evidence at the 5pm gate busy-hour.
-- ============================================================================

-- Collectors with a photo, a code and an approval state. Guardian-added
-- collectors without a photo wait for the centre to verify them.
ALTER TABLE authorised_collectors
  ADD COLUMN IF NOT EXISTS photo_url TEXT,
  ADD COLUMN IF NOT EXISTS pin_hash TEXT,
  ADD COLUMN IF NOT EXISTS pin_created_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_trusted BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approval_status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (approval_status IN ('pending','approved','rejected'));
CREATE INDEX IF NOT EXISTS ix_collectors_learner_active ON authorised_collectors(learner_id, status);

-- Custody flag: halts every release for a learner until cleared by management.
ALTER TABLE learners
  ADD COLUMN IF NOT EXISTS collection_hold_reason TEXT;

-- Per-event evidence: who verified, how, the parent's receipt, the override, the late tag.
ALTER TABLE learner_collection_events
  ADD COLUMN IF NOT EXISTS signature_data TEXT,
  ADD COLUMN IF NOT EXISTS signature_captured BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS collector_photo_url TEXT,
  ADD COLUMN IF NOT EXISTS late BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS override_by UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS override_reason TEXT,
  ADD COLUMN IF NOT EXISTS denial_reason TEXT,
  ADD COLUMN IF NOT EXISTS parent_notified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS request_id UUID;

-- Guardian approval flow for unusual pickups: one pending request per child,
-- auto-expires after 10 minutes.
CREATE TABLE learner_collection_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  learner_id UUID NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  collector_id UUID REFERENCES authorised_collectors(id) ON DELETE SET NULL,
  collector_name VARCHAR(200) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','declined','expired')),
  reason VARCHAR(30) NOT NULL DEFAULT 'new_collector' CHECK (reason IN ('new_collector','overdue_collector','hold','unusual_hour')),
  requested_by UUID REFERENCES users(id),
  resolved_by UUID REFERENCES users(id),
  resolution_note TEXT,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_collection_requests_pending ON learner_collection_requests(learner_id) WHERE status = 'pending';
CREATE INDEX ix_collection_requests_org ON learner_collection_requests(organisation_id, status);

CREATE INDEX IF NOT EXISTS ix_collection_events_learner_date ON learner_collection_events(learner_id, recorded_at);
