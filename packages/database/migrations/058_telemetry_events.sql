-- Privacy-friendly product diagnostics. No user id, no child data, no free
-- text from forms: only sanitised event names, routes and coarse device facts.
CREATE TABLE IF NOT EXISTS telemetry_events (
  id BIGSERIAL PRIMARY KEY,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  kind VARCHAR(24) NOT NULL CHECK (kind IN ('page_view','click','scroll','error','event')),
  name VARCHAR(120) NOT NULL,
  path VARCHAR(240) NOT NULL DEFAULT '/',
  area VARCHAR(24) NOT NULL DEFAULT 'public',
  os VARCHAR(40),
  device VARCHAR(24),
  browser VARCHAR(40),
  viewport VARCHAR(24),
  app_version VARCHAR(40),
  session_key VARCHAR(64),
  details JSONB NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS ix_telemetry_time ON telemetry_events(occurred_at DESC);
CREATE INDEX IF NOT EXISTS ix_telemetry_kind ON telemetry_events(kind, occurred_at DESC);
CREATE INDEX IF NOT EXISTS ix_telemetry_device ON telemetry_events(os, device, occurred_at DESC);
CREATE INDEX IF NOT EXISTS ix_telemetry_name ON telemetry_events(name, occurred_at DESC);
