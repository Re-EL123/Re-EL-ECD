-- Outbound email delivery log.
--
-- Every message the platform attempts to send is recorded here, whether the
-- provider accepted it, rejected it, or no provider is configured. This keeps
-- "did the parent actually get the invoice?" answerable without a mail server
-- and gives the platform console something real to report on.

CREATE TABLE email_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID REFERENCES organisations(id) ON DELETE CASCADE,
  recipient VARCHAR(320) NOT NULL,
  subject VARCHAR(300) NOT NULL,
  template VARCHAR(80),
  provider VARCHAR(40) NOT NULL DEFAULT 'resend',
  provider_message_id VARCHAR(200),
  status VARCHAR(20) NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','sent','failed','skipped')),
  error TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ
);

CREATE INDEX ix_email_deliveries_org ON email_deliveries(organisation_id, created_at DESC);
CREATE INDEX ix_email_deliveries_status ON email_deliveries(status, created_at DESC);
CREATE INDEX ix_email_deliveries_recipient ON email_deliveries(recipient);
