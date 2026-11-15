-- ============================================================================
-- Parent-app pickup: a guardian can act as the collector from their own
-- authenticated app — no QR, no PIN — and the centre still sees exactly who
-- is standing at the gate and that the identity is verified by login.
-- ============================================================================

ALTER TABLE gate_scans
  ADD COLUMN IF NOT EXISTS source VARCHAR(20) NOT NULL DEFAULT 'gate_qr'
    CHECK (source IN ('gate_qr', 'parent_app'));
