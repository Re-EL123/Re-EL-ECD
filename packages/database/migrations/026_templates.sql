-- Reusable content templates for lessons, activities, observations and
-- announcements. Centres keep their own templates; built-in starter
-- templates are provided by the API so every centre starts with a library.
CREATE TABLE content_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  kind VARCHAR(30) NOT NULL CHECK (kind IN ('lesson_plan', 'activity', 'observation', 'announcement')),
  name VARCHAR(120) NOT NULL,
  description TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX ix_content_templates_org_kind_name ON content_templates(organisation_id, kind, name);
CREATE INDEX ix_content_templates_org_kind ON content_templates(organisation_id, kind);
