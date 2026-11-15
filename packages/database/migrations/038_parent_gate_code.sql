-- ============================================================================
-- The parent is a collector too. Their own 6-digit gate code works at the
-- centre QR for every child they guard — the app never records custody
-- remotely; everything still happens at the gate, one scan, one tap.
-- ============================================================================

ALTER TABLE guardians
  ADD COLUMN IF NOT EXISTS collection_pin_hash TEXT,
  ADD COLUMN IF NOT EXISTS collection_pin_created_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS ix_guardians_pin_lookup
  ON guardians (organisation_id, lower(split_part(first_name, ' ', 1)))
  WHERE collection_pin_hash IS NOT NULL AND status = 'active';
