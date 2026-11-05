-- Forms can ask for a payment as part of the submission (for example an
-- enrolment deposit or an excursion contribution). Payment configuration lives
-- on the form definition; each submission records the resulting intent.

ALTER TABLE form_definitions
  ADD COLUMN IF NOT EXISTS payment_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS payment_required BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS payment_amount NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS payment_currency VARCHAR(3),
  ADD COLUMN IF NOT EXISTS payment_description TEXT,
  ADD COLUMN IF NOT EXISTS display_on_website BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE form_submissions
  ADD COLUMN IF NOT EXISTS payment_status VARCHAR(20) NOT NULL DEFAULT 'not_required',
  ADD COLUMN IF NOT EXISTS payment_intent_id UUID REFERENCES payment_intents(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS amount_paid NUMERIC(12,2);

CREATE INDEX IF NOT EXISTS ix_form_submissions_payment_intent
  ON form_submissions(payment_intent_id);
