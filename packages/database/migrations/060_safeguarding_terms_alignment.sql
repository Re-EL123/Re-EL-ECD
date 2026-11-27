-- Align the live Terms with the Safeguarding & Operational Disclaimer.
-- Additive: preserves any platform-admin edits.
UPDATE documents
SET sections = sections || '[{"heading":"Safeguarding and operational responsibilities","paragraphs":["Re-EL ECD provides digital tools to support ECD administration and safeguarding procedures. The centre remains responsible for supervising children; for maintaining appropriate safeguarding policies and collection procedures; for ensuring that authorised collectors are correctly registered; and for ensuring that staff follow the centre’s established verification procedures. Re-EL ECD does not replace physical supervision, responsible staff or applicable regulatory requirements."],"steps":["The Safeguarding & Operational Disclaimer forms part of these Terms."]}]'::jsonb,
    version = version + 1,
    updated_at = now()
WHERE slug = 'terms'
  AND NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(sections) s
    WHERE s->>'heading' ILIKE '%Safeguarding and operational responsibilities%'
  );

UPDATE documents
SET sections = (
  SELECT jsonb_agg(
    CASE WHEN s->>'heading' ILIKE '%No registration or compliance certification%'
      THEN jsonb_set(s, '{paragraphs}',
        '["Using Re-EL ECD does not automatically register an ECD centre or certify legal compliance. South African Government ECD registration with the relevant provincial Department of Social Development (DSD) or Department of Basic Education (DBE), and any municipal, health, fire or zoning approvals, are separate and remain the centre’s responsibility. Re-EL ECD is not a South African Government department, does not act for any department, and does not register, inspect or certify centres. Badges, registration-number fields and published website pages are user-supplied content, not verification or proof of registration."]'::jsonb)
      ELSE s END
    ORDER BY n)
  FROM jsonb_array_elements(sections) WITH ORDINALITY AS t(s, n)
),
version = version + 1,
updated_at = now()
WHERE slug = 'safeguarding-disclaimer'
  AND EXISTS (SELECT 1 FROM jsonb_array_elements(sections) s WHERE s->>'heading' ILIKE '%No registration or compliance certification%')
  AND NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(sections) s
    WHERE s->>'heading' ILIKE '%No registration or compliance certification%'
      AND s->>'paragraphs' ILIKE '%South African Government department%'
  );
