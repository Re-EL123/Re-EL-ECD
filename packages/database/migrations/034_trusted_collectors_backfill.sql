-- ============================================================================
-- Backfill: collectors who had already collected a child were working fine
-- before the approval workflow existed — keep them approved and trusted.
-- Guardians' own photo-bearing additions were the verification the workflow
-- now requires, so they're grandfathered in too. Nothing else changes, and
-- brand-new collectors still default to pending approval.
-- ============================================================================

-- Collectors with historic pickups stay usable at the gate.
UPDATE authorised_collectors ac
SET approval_status = 'approved',
    approved_at = COALESCE(ac.approved_at, ac.created_at),
    is_trusted = TRUE
WHERE ac.approval_status = 'pending'
  AND EXISTS (
    SELECT 1 FROM learner_collection_events ce
    WHERE ce.collector_id = ac.id AND ce.event_type = 'collection'
  );

-- Guardians' photo-bearing collector additions were the verification.
UPDATE authorised_collectors ac
SET approval_status = 'approved',
    approved_at = COALESCE(ac.approved_at, ac.created_at),
    is_trusted = TRUE
WHERE ac.approval_status = 'pending'
  AND ac.photo_url IS NOT NULL;
