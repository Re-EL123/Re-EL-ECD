-- Tenant fee collection modes and Re-EL subscription invoices.
--
-- Every tenant collects parent fees one of two ways:
--   - platform_collected: PayFast charges the parent through the platform's
--     merchant account and pays the tenant by EFT (minus the configured fee).
--   - own_payfast: the tenant's own PayFast merchant account is charged, so
--     PayFast settles directly to the tenant's bank account.
--
-- Tenants also pay Re-EL for their own subscription. Each billing period
-- issues one invoice; paying it extends the subscription.

CREATE TABLE organisation_payment_accounts (
  organisation_id UUID PRIMARY KEY REFERENCES organisations(id) ON DELETE CASCADE,
  mode VARCHAR(20) NOT NULL DEFAULT 'platform_collected'
    CHECK (mode IN ('own_payfast','platform_collected')),
  status VARCHAR(20) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','unverified','disabled')),
  merchant_id VARCHAR(60),
  merchant_key_encrypted TEXT,
  passphrase_encrypted TEXT,
  fee_percent NUMERIC(5,2) NOT NULL DEFAULT 0
    CHECK (fee_percent >= 0 AND fee_percent <= 50),
  payout_account_holder TEXT,
  payout_bank_name TEXT,
  payout_branch_code VARCHAR(20),
  payout_account_number_encrypted TEXT,
  payout_account_type VARCHAR(20)
    CHECK (payout_account_type IS NULL OR payout_account_type IN ('cheque','savings','transmission','bond')),
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_organisation_payment_accounts_org ON organisation_payment_accounts(organisation_id);

CREATE TABLE platform_payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  gross_amount NUMERIC(14,2) NOT NULL CHECK (gross_amount >= 0),
  fee_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (fee_amount >= 0),
  net_amount NUMERIC(14,2) NOT NULL CHECK (net_amount >= 0),
  currency VARCHAR(3) NOT NULL DEFAULT 'ZAR',
  reference VARCHAR(120),
  notes TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'paid' CHECK (status IN ('paid','void')),
  paid_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_platform_payouts_org ON platform_payouts(organisation_id, created_at DESC);

CREATE TABLE platform_subscription_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  subscription_id UUID NOT NULL REFERENCES platform_subscriptions(id) ON DELETE CASCADE,
  invoice_number VARCHAR(40) NOT NULL UNIQUE,
  payment_reference VARCHAR(60),
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  currency VARCHAR(3) NOT NULL DEFAULT 'ZAR',
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'issued' CHECK (status IN ('issued','paid','void')),
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  due_at DATE,
  paid_at TIMESTAMPTZ,
  payment_intent_id UUID REFERENCES payment_intents(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (subscription_id, period_start)
);
CREATE INDEX ix_subscription_invoices_org ON platform_subscription_invoices(organisation_id, created_at DESC);

ALTER TABLE platform_subscriptions
  ADD COLUMN IF NOT EXISTS last_reminder_at TIMESTAMPTZ;
