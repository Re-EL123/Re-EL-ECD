-- Two-factor authentication (TOTP) for staff accounts. Secrets are stored
-- encrypted (AES-256-GCM, PAYMENT_CREDENTIALS_KEY); recovery codes are stored
-- only as SHA-256 hashes. mfa_challenges are short-lived proof tokens that
-- let a password-authenticated login exchange for a session after the
-- second factor — or a recovery code — checks out.
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_enabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_secret_enc TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_recovery_hashes JSONB NOT NULL DEFAULT '[]'::jsonb;
CREATE TABLE IF NOT EXISTS mfa_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT now() + interval '10 minutes',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  used_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS ix_mfa_challenges_user ON mfa_challenges (user_id, created_at DESC);
