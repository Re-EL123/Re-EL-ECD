-- 017: generalise PayFast payment intents beyond a single invoice.
--
-- Statements settle several invoices with one hosted checkout, so an intent
-- needs to say what it is for and carry the extra context (the invoice ids a
-- statement covers). Invoice intents keep the default so existing rows and
-- code paths are unchanged.
ALTER TABLE payment_intents ADD COLUMN IF NOT EXISTS purpose VARCHAR(40) NOT NULL DEFAULT 'invoice';
ALTER TABLE payment_intents ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS ix_payment_intents_org_purpose ON payment_intents(organisation_id, purpose);
