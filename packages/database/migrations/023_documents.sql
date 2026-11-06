-- Role user manuals and editable legal documents.
--
-- Manuals and legal pages are platform documents, not tenant data. They
-- are stored once and served to every organisation. The super admin can
-- edit any document (including legal ones) from the platform console;
-- every edit is audited.

CREATE TABLE IF NOT EXISTS documents (
  slug TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'manual',
  role_key TEXT,
  lede TEXT NOT NULL DEFAULT '',
  intro JSONB NOT NULL DEFAULT '[]',
  sections JSONB NOT NULL DEFAULT '[]',
  version INT NOT NULL DEFAULT 1,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_documents_role ON documents(role_key);
CREATE INDEX IF NOT EXISTS ix_documents_category ON documents(category);
