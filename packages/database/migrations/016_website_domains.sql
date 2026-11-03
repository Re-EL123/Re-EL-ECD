-- 016: real custom-domain verification for tenant websites.
--
-- A domain used to be a bare hostname with a status nobody ever set. It now
-- carries the token and timestamps needed to prove control of the DNS name,
-- so the public site can only be served on a domain the tenant actually owns.
--
-- Verification accepts either a CNAME to the Re-EL website edge or a TXT
-- record at _reel-verify.<domain>. The TXT route is the correct option for an
-- apex domain, where the DNS standard does not allow a CNAME.

ALTER TABLE domains ADD COLUMN IF NOT EXISTS verification_token VARCHAR(64);
ALTER TABLE domains ADD COLUMN IF NOT EXISTS verification_method VARCHAR(20) NOT NULL DEFAULT 'cname';
ALTER TABLE domains ADD COLUMN IF NOT EXISTS last_checked_at TIMESTAMPTZ;
ALTER TABLE domains ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;
ALTER TABLE domains ADD COLUMN IF NOT EXISTS failure_reason TEXT;
ALTER TABLE domains ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Existing rows predate the token. Give each one a stable random value rather
-- than leaving NULL, because the verifier must never accept an empty token.
UPDATE domains
SET verification_token = replace(gen_random_uuid()::text, '-', '')
WHERE verification_token IS NULL;

UPDATE domains
SET verified_at = COALESCE(verified_at, created_at)
WHERE verification_status = 'verified';

ALTER TABLE domains ALTER COLUMN verification_token SET NOT NULL;

-- Domain names are case-insensitive. The original UNIQUE constraint is
-- case-sensitive, so add a canonical lower-case index as well.
CREATE UNIQUE INDEX IF NOT EXISTS ux_domains_domain_name ON domains (lower(domain_name));
CREATE INDEX IF NOT EXISTS ix_domains_organisation ON domains (organisation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_domains_verification ON domains (verification_status);
