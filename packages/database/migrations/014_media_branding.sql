-- 014: media storage (Cloudflare R2) and organisation branding themes.
--
-- Files live in object storage; the database stores only URLs and metadata.
-- Themes are reusable palettes that an organisation can apply to its
-- workspace, public website and transactional email accents.

CREATE TABLE media_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
  scope VARCHAR(40) NOT NULL DEFAULT 'general',
  owner_type VARCHAR(40),
  owner_id UUID,
  original_filename VARCHAR(255) NOT NULL,
  storage_key TEXT NOT NULL,
  url TEXT NOT NULL,
  mime_type VARCHAR(120) NOT NULL,
  size_bytes BIGINT,
  kind VARCHAR(20) NOT NULL DEFAULT 'image'
    CHECK (kind IN ('image','video','audio','document')),
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','ready','deleted')),
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX ix_media_assets_org ON media_assets(organisation_id, created_at DESC);
CREATE INDEX ix_media_assets_owner ON media_assets(organisation_id, owner_type, owner_id);
CREATE UNIQUE INDEX ux_media_assets_key ON media_assets(storage_key);

CREATE TABLE organisation_themes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  name VARCHAR(80) NOT NULL,
  tokens JSONB NOT NULL DEFAULT '{}',
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organisation_id, name)
);

CREATE INDEX ix_organisation_themes_org ON organisation_themes(organisation_id, created_at);

ALTER TABLE organisations ADD COLUMN IF NOT EXISTS secondary_colour VARCHAR(9) DEFAULT '#C97A12';
ALTER TABLE organisations ADD COLUMN IF NOT EXISTS accent_colour VARCHAR(9) DEFAULT '#3D8FAE';
ALTER TABLE organisations ADD COLUMN IF NOT EXISTS theme_tokens JSONB NOT NULL DEFAULT '{}';
ALTER TABLE organisations ADD COLUMN IF NOT EXISTS applied_theme_id UUID REFERENCES organisation_themes(id) ON DELETE SET NULL;

ALTER TABLE learners ADD COLUMN IF NOT EXISTS profile_image_url TEXT;
ALTER TABLE branches ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE learner_portfolio_items ADD COLUMN IF NOT EXISTS media_url TEXT;
ALTER TABLE learner_documents ADD COLUMN IF NOT EXISTS file_url TEXT;
ALTER TABLE staff_documents ADD COLUMN IF NOT EXISTS file_url TEXT;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS attachment_urls JSONB NOT NULL DEFAULT '[]';
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS attachment_urls JSONB NOT NULL DEFAULT '[]';
ALTER TABLE daily_reports ADD COLUMN IF NOT EXISTS photo_urls JSONB NOT NULL DEFAULT '[]';
ALTER TABLE messages ADD COLUMN IF NOT EXISTS attachment_urls JSONB NOT NULL DEFAULT '[]';
