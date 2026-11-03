-- 018: application and enrolment fees collected through PayFast.
--
-- An admission application may carry a fee the family pays online before a
-- place is confirmed. The fee lives on the application so staff can waive or
-- adjust it, and the PayFast ITN flips it to paid. Applications without a fee
-- stay 'not_required', so existing rows and code paths are unchanged.
ALTER TABLE admission_applications ADD COLUMN IF NOT EXISTS application_fee_amount NUMERIC(12,2);
ALTER TABLE admission_applications ADD COLUMN IF NOT EXISTS application_fee_currency VARCHAR(3) DEFAULT 'ZAR';
ALTER TABLE admission_applications ADD COLUMN IF NOT EXISTS application_fee_status VARCHAR(20) NOT NULL DEFAULT 'not_required';
ALTER TABLE admission_applications ADD COLUMN IF NOT EXISTS application_fee_paid_at TIMESTAMPTZ;
ALTER TABLE admission_applications ADD COLUMN IF NOT EXISTS application_fee_payment_id UUID REFERENCES payments(id);

CREATE INDEX IF NOT EXISTS ix_admission_applications_org_fee ON admission_applications(organisation_id, application_fee_status);
