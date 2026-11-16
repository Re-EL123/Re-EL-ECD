-- Subscription overdue auto-lockout marker support is handled in application logic
-- (organisations.suspended_reason = 'Subscription payment overdue'), and collect
-- on-site setup/visit details required before paying the once-off setup fee online.

ALTER TABLE platform_setup_fees
  ADD COLUMN IF NOT EXISTS visit_details JSONB;

COMMENT ON COLUMN platform_setup_fees.visit_details IS
  'Contact and visit details captured before online setup payment so Re-EL representatives can come to the centre.';
