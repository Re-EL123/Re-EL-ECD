-- ============================================================================
-- The parent value loop: story-driven digests, one-tap moments, pickup
-- briefs, parent reactions and a week-one onboarding journey.
-- ============================================================================

-- Week-one onboarding state + email-digest open tracking, kept on the
-- membership so the cron sweep is a single indexed scan.
ALTER TABLE memberships
  ADD COLUMN IF NOT EXISTS activation JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE memberships
  ADD COLUMN IF NOT EXISTS digest_opened_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS ix_memberships_digest_opened ON memberships(digest_opened_at);

-- Quick "moment" observations: tagged to a domain, no objective required.
ALTER TABLE learner_observations
  ADD COLUMN IF NOT EXISTS domain_id UUID REFERENCES curriculum_domains(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS ix_observations_domain ON learner_observations(domain_id);

-- Teacher's one-paragraph arc for the monthly portfolio digest. One per
-- child per calendar month, written in ten seconds, read for a lifetime.
CREATE TABLE monthly_arcs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  learner_id UUID NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  period_month DATE NOT NULL,
  paragraph TEXT NOT NULL CHECK (char_length(paragraph) BETWEEN 10 AND 1200),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organisation_id, learner_id, period_month)
);
CREATE INDEX ix_monthly_arcs_org_month ON monthly_arcs(organisation_id, period_month);

-- Parent reactions to moments and reports: ❤️ 👍 or "I'd love to know more".
-- The teacher reads these on the morning card; parents never feel unheard.
CREATE TABLE guardian_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  resource_type VARCHAR(40) NOT NULL CHECK (resource_type IN ('observation', 'daily_report')),
  resource_id UUID NOT NULL,
  guardian_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  learner_id UUID REFERENCES learners(id) ON DELETE CASCADE,
  reaction VARCHAR(20) NOT NULL CHECK (reaction IN ('heart', 'thumb', 'more')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (resource_type, resource_id, guardian_user_id, reaction)
);
CREATE INDEX ix_guardian_reactions_resource ON guardian_reactions(resource_type, resource_id);
CREATE INDEX ix_guardian_reactions_learner ON guardian_reactions(learner_id, created_at);

-- PATCH on daily reports has written updated_at since launch, but the column
-- never existed — every daily-report edit failed. Add it properly.
ALTER TABLE daily_reports ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
