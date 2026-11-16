-- Once-off R700 launch/setup package per organisation.
-- Covers: 3 days staff training, platform setup, public website setup,
-- curriculum template, module templates, activities templates, launch marketing.
-- Paid to the Re-EL platform (not tenant-collected); may be settled online via
-- PayFast (grossed up to cover processing so Re-EL nets the base amount) or
-- recorded manually/waived by the platform.

CREATE TABLE IF NOT EXISTS platform_setup_fees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  amount NUMERIC(12,2) NOT NULL DEFAULT 700.00 CHECK (amount > 0),
  currency VARCHAR(3) NOT NULL DEFAULT 'ZAR',
  status VARCHAR(20) NOT NULL DEFAULT 'issued' CHECK (status IN ('issued','paid','waived','void')),
  includes JSONB NOT NULL DEFAULT '["3 days staff training","Platform setup","Public website setup","Curriculum template","Module templates","Activities templates","Launch marketing"]'::jsonb,
  payment_intent_id UUID REFERENCES payment_intents(id) ON DELETE SET NULL,
  payment_reference VARCHAR(60),
  paid_at TIMESTAMPTZ,
  waived_at TIMESTAMPTZ,
  waived_reason TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organisation_id)
);

CREATE INDEX IF NOT EXISTS ix_platform_setup_fees_org ON platform_setup_fees(organisation_id);
CREATE INDEX IF NOT EXISTS ix_platform_setup_fees_status ON platform_setup_fees(status);

-- Backfill: every existing non-platform organisation gets an issued setup fee
-- record so the once-off package is tracked. (Can be marked paid/waived by
-- platform ops where already settled historically.)
INSERT INTO platform_setup_fees (organisation_id, amount, currency, status, notes)
SELECT o.id, 700.00, COALESCE(o.currency, 'ZAR'), 'issued',
  'Auto-issued when setup fee tracking was introduced.'
FROM organisations o
WHERE o.slug <> 're-el-platform'
ON CONFLICT (organisation_id) DO NOTHING;
