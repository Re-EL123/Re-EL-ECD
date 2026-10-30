-- 015: platform branding, editable subscription plans and bulk actions.
--
-- Subscription plans were previously seed-only: the platform console could read
-- them but not create or change one. Plans now carry a description, a lifecycle
-- timestamp and an archive flag so a plan can be retired without deleting the
-- subscriptions that reference it.
--
-- The platform organisation also gets the Re-EL ECD palette sampled from the
-- corporate logo. The update only applies while the palette is still the
-- untouched default, so a platform administrator's later choice always wins.

ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS ix_platform_subscriptions_org
  ON platform_subscriptions(organisation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_platform_subscriptions_plan
  ON platform_subscriptions(plan_id);

-- Platform super administrators upload the platform logo and share media.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r CROSS JOIN permissions p
WHERE r.role_key = 'platform_super_admin'
  AND p.permission_key LIKE 'media.%'
ON CONFLICT DO NOTHING;

UPDATE subscription_plans
SET description = COALESCE(description, CASE plan_key
  WHEN 'seedling' THEN 'A single classroom starting out: attendance, learning notes and the parent portal.'
  WHEN 'sapling' THEN 'A growing centre: adds finance, assessments and the public website builder.'
  WHEN 'evergreen' THEN 'Multi-branch operations with advanced reporting, inventory and priority support.'
  ELSE 'Re-EL ECD subscription plan.'
END)
WHERE description IS NULL;

UPDATE organisations
SET primary_colour = '#0B534A',
    secondary_colour = '#2B9A58',
    accent_colour = '#6FC79B',
    theme_tokens = '{"primary":"#0B534A","secondary":"#2B9A58","accent":"#6FC79B","background":"#F6F9F7","surface":"#FFFFFF","text":"#0E2B26","onPrimary":"#FFFFFF"}'::jsonb,
    updated_at = now()
WHERE slug = 're-el-platform'
  AND primary_colour = '#3A7D44';
