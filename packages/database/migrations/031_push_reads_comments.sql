-- Web Push subscriptions for parents and staff.
CREATE TABLE push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  membership_id UUID REFERENCES memberships(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_push_subscriptions_user ON push_subscriptions(user_id);
CREATE INDEX ix_push_subscriptions_org ON push_subscriptions(organisation_id);

-- Per-member push preferences: master switch plus per-type toggles.
ALTER TABLE memberships
  ADD COLUMN IF NOT EXISTS push_preferences JSONB NOT NULL DEFAULT '{"enabled": true}'::jsonb;

-- Read receipts for content shared with families.
ALTER TABLE learner_observations ADD COLUMN IF NOT EXISTS parent_viewed_at TIMESTAMPTZ;
ALTER TABLE daily_reports ADD COLUMN IF NOT EXISTS parent_viewed_at TIMESTAMPTZ;

-- Inline coaching comments on observations (leadership -> teacher).
CREATE TABLE observation_review_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  observation_id UUID NOT NULL REFERENCES learner_observations(id) ON DELETE CASCADE,
  author_user_id UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_observation_review_comments_obs ON observation_review_comments(observation_id);

CREATE TABLE push_config (
  id BOOLEAN PRIMARY KEY DEFAULT TRUE,
  public_key TEXT NOT NULL,
  private_key TEXT NOT NULL,
  subject TEXT NOT NULL DEFAULT 'mailto:hello@re-el.co.za',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Weekly family digest (Friday). Opt-out lives on the membership.
ALTER TABLE memberships ADD COLUMN IF NOT EXISTS email_digest BOOLEAN NOT NULL DEFAULT TRUE;
