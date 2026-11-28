-- Be explicit in the live legal documents about exports and backup cycles.
UPDATE documents
SET sections = sections || '[{"heading":"Data exports and backups","paragraphs":["Settings → Data & backups produces a full ZIP of CSV/JSON files for every record type plus a media manifest, delivered by a signed link that expires after 24 hours. Weekly or monthly scheduled exports are available. Exports contain sensitive personal information about children and families, so centres must store them securely and delete them when no longer needed."],"steps":["Encrypted backups and nightly snapshots are retained for their ordinary cycle before they age out."]}]'::jsonb,
    version = version + 1, updated_at = now()
WHERE slug = 'terms'
  AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(sections) s WHERE s->>'heading' ILIKE '%Data exports and backups%');

UPDATE documents
SET sections = sections || '[{"heading":"Backups and exports","paragraphs":["We keep encrypted nightly backups of critical records for 30 days, alongside the managed database point-in-time restore, so information can be recovered after an accidental change. You can request a full export of your centre’s information at any time from Settings → Data & backups. Exports include children’s records and medical notes — store them securely."],"steps":[]}]'::jsonb,
    version = version + 1, updated_at = now()
WHERE slug = 'privacy'
  AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(sections) s WHERE s->>'heading' ILIKE '%Backups and exports%');

UPDATE documents
SET sections = (
  SELECT jsonb_agg(
    CASE WHEN s->>'heading' ILIKE '%Export, retention and deletion%'
      THEN jsonb_set(s, '{paragraphs,0}',
        '"During the transition window the centre may export its records from Settings → Data & backups, which produces a full ZIP of CSV/JSON files for every record type plus a media manifest, delivered by a signed link that expires after 24 hours. Per-resource exports remain available for quick downloads. Exports contain sensitive personal information, including children’s records and medical notes, and the centre must store them securely."'::jsonb)
      ELSE s END
    ORDER BY n)
  FROM jsonb_array_elements(sections) WITH ORDINALITY AS t(s, n)
), version = version + 1, updated_at = now()
WHERE slug = 'data-processing-agreement'
  AND NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(sections) s
    WHERE s->>'heading' ILIKE '%Export, retention and deletion%'
      AND s->>'paragraphs' ILIKE '%signed link that expires%'
  );
