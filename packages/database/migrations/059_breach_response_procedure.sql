-- Publish the security incident / breach response procedure as an editable
-- platform document and align the DPA's incident clause with it.
INSERT INTO documents (slug, title, category, role_key, lede, intro, sections, version)
VALUES ('breach-response', 'Security Incident & Breach Response Procedure', 'legal', NULL,
  'Exactly what happens when learner records are accessed without authorisation (POPIA s22).',
  '["DRAFT OPERATIONAL TEMPLATE — not yet approved by an Information Officer or reviewed by a South African attorney. Informed by the Information Regulator Fact Sheet on Handling of Security Compromises (August 2025) and the section 22 notification guidelines.", "The centre is the responsible party for the information it enters; its Information Officer must notify the Information Regulator and affected data subjects. Re-EL ECD is normally the operator and must immediately notify the centre.", "The clock starts when there are reasonable grounds to believe a compromise occurred, not when the investigation ends. There is no risk threshold: all compromises are reported."]'::jsonb,
  '[{"heading":"1. Detect and investigate","paragraphs":["Record discovery time, source and observations. Appoint an incident lead and open an incident log. Establish what happened, which systems and centre were involved, which data categories were reachable, how many individuals could be affected and whether access is active."],"steps":[]},{"heading":"2. Restrict unauthorised access","paragraphs":["Revoke sessions and support impersonation, suspend the user or centre, rotate exposed credentials, block the source and patch the access path. A second person verifies containment. Do not delete records or logs before evidence is preserved."],"steps":[]},{"heading":"3. Preserve logs and evidence","paragraphs":["Freeze and copy audit events, sessions, delivery logs, webhook events, telemetry and application, database, storage and edge logs. Export to dated immutable storage, record hashes and chain of custody, and take a database snapshot before destructive changes."],"steps":[]},{"heading":"4. Inform the affected centre","paragraphs":["Notify the owner/principal in writing immediately, before the investigation is complete: what happened and when, systems involved, data categories, containment already done, and what the centre must do. Confirm the Information Officer and whether SAPS or DSD/DBE is engaged."],"steps":[]},{"heading":"5. Determine affected individuals","paragraphs":["Scope by centre then reachable records: learners, guardians, staff, medical notes, attendance, observations, documents, finance and media. Decide per category whether there are reasonable grounds to believe it was accessed; count and identify individuals and record likely consequences in a restricted schedule."],"steps":[]},{"heading":"6. POPIA notification","paragraphs":["The centre’s Information Officer lodges the prescribed Security Compromise Notification Form via the Regulator’s eServices portal as soon as reasonably possible, and keeps the acknowledgement/reference. Affected individuals are told in writing what happened and when, possible consequences, measures taken or planned, recommended protective steps and the identity of the unauthorised person if known. Report with available facts and update; explain any delay. Keep a website notice 30–90 days where used."],"steps":["Official guidance: Information Regulator Fact Sheet on Handling of Security Compromises (2025), section 22 guidelines, and eservices.inforegulator.org.za."]},{"heading":"7. Document corrective actions","paragraphs":["Keep one incident record with timeline, evidence register, containment steps and notification copies. Review root cause within ten business days, assign corrective actions with owners and due dates, verify completion, and retain the record under the centre’s retention policy and any legal hold."],"steps":["Full playbook and templates: docs/breach-response.md."]},{"heading":"Contacts","paragraphs":["Re-EL: privacy@re-el.co.za · support@re-el.co.za. Information Regulator: enquiries@inforegulator.org.za · 010 023 5200 · toll free 0800 017 160."],"steps":[]}]'::jsonb, 1)
ON CONFLICT (slug) DO NOTHING;

-- Point the DPA's incident clause at the published procedure without
-- overwriting any other edits made by a platform administrator.
UPDATE documents
SET sections = (
  SELECT jsonb_agg(
    CASE WHEN s->>'heading' LIKE '10. Security incidents%'
      THEN jsonb_set(s, '{paragraphs}',
        '["A security incident means unauthorised access to, disclosure of, alteration or loss of personal information. The centre must notify Re-EL ECD without unreasonable delay at privacy@re-el.co.za if it suspects an incident involving the Service.", "Re-EL ECD will investigate promptly, contain and remediate, keep the centre informed, and provide a written summary. As operator it will immediately notify the affected centre of a suspected or confirmed compromise and supply the facts needed for its POPIA notifications. Where Re-EL ECD is itself the responsible party it will notify the Information Regulator and affected data subjects without unreasonable delay under POPIA section 22. The full Security Incident & Breach Response Procedure is published in the Legal hub."]'::jsonb)
      ELSE s END
    ORDER BY n)
  FROM jsonb_array_elements(sections) WITH ORDINALITY AS t(s, n)
),
version = version + 1,
updated_at = now()
WHERE slug = 'data-processing-agreement'
  AND EXISTS (SELECT 1 FROM jsonb_array_elements(sections) s WHERE s->>'heading' LIKE '10. Security incidents%')
  AND NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(sections) s
    WHERE s->>'heading' LIKE '10. Security incidents%'
      AND s->>'paragraphs' LIKE '%Breach Response Procedure%'
  );
