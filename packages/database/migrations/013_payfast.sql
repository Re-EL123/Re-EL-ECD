-- Online card payments through PayFast.
--
-- A payment intent is created when a guardian (or the office on their behalf)
-- starts a checkout. It carries the reference that PayFast echoes back in the
-- ITN, so a webhook can be matched to the invoice it belongs to even after a
-- page reload or a retry.

ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_payment_method_check;
ALTER TABLE payments ADD CONSTRAINT payments_payment_method_check
  CHECK (payment_method IN ('eft','cash','card','debit_order','snapscan','payfast','other'));

CREATE TABLE payment_intents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  invoice_id UUID REFERENCES invoices(id) ON DELETE CASCADE,
  guardian_id UUID REFERENCES guardians(id) ON DELETE SET NULL,
  reference VARCHAR(120) NOT NULL,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  currency VARCHAR(3) NOT NULL DEFAULT 'ZAR',
  provider VARCHAR(40) NOT NULL DEFAULT 'payfast',
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','paid','cancelled','failed')),
  provider_reference VARCHAR(200),
  payment_id UUID REFERENCES payments(id) ON DELETE SET NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  UNIQUE (organisation_id, reference)
);

CREATE INDEX ix_payment_intents_invoice ON payment_intents(invoice_id);
CREATE INDEX ix_payment_intents_org_status ON payment_intents(organisation_id, status);
