-- 017: one active grant per membership, role and branch.
--
-- The role endpoint used to insert unconditionally, so a double-click or a
-- repeated submit could stack identical rows. The members list then showed the
-- same role several times and access resolution repeated the same permissions.
--
-- Revoke duplicates first (prefer a live grant over an expired one, then the
-- earliest), so the partial unique index can be created on existing data.
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY membership_id, role_id,
             COALESCE(branch_id, '00000000-0000-0000-0000-000000000000'::uuid)
           ORDER BY (expires_at IS NULL OR expires_at > now()) DESC,
                    granted_at ASC,
                    id ASC
         ) AS position
  FROM membership_roles
  WHERE status = 'active'
)
UPDATE membership_roles AS mr
SET status = 'revoked'
FROM ranked
WHERE mr.id = ranked.id
  AND ranked.position > 1;

CREATE UNIQUE INDEX ux_membership_roles_active_grant
  ON membership_roles (
    membership_id,
    role_id,
    COALESCE(branch_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  WHERE status = 'active';
