-- Make the live Terms explicit that registration is a South African Government
-- process and that Re-EL ECD is not a government body.
UPDATE documents
SET sections = (
  SELECT jsonb_agg(
    CASE WHEN s->>'heading' ILIKE '%Registration%'
      THEN jsonb_set(s, '{paragraphs}',
        '["Using Re-EL ECD does not automatically register an ECD centre or certify that it is legally compliant. South African Government requirements for ECD registration — including registration with the relevant provincial Department of Social Development (DSD) or Department of Basic Education (DBE), compliance with registration regulations, and any municipal, health, fire or zoning approvals — are separate processes that remain the centre’s responsibility. Re-EL ECD is not a South African Government department, does not act for any department, and does not register, inspect or certify ECD centres. Platform badges, registration-number fields and published website content are user-supplied and are not proof of registration. See the Safeguarding & Operational Disclaimer."]'::jsonb)
      ELSE s END
    ORDER BY n)
  FROM jsonb_array_elements(sections) WITH ORDINALITY AS t(s, n)
),
version = version + 1,
updated_at = now()
WHERE slug = 'terms'
  AND EXISTS (SELECT 1 FROM jsonb_array_elements(sections) s WHERE s->>'heading' ILIKE '%Registration%')
  AND NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(sections) s
    WHERE s->>'heading' ILIKE '%Registration%'
      AND s->>'paragraphs' ILIKE '%South African Government department%'
  );
