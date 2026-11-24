-- Storage allowance per subscription plan, in bytes. 0 means unlimited,
-- mirroring max_learners / max_staff.
ALTER TABLE subscription_plans
  ADD COLUMN IF NOT EXISTS max_storage_bytes BIGINT NOT NULL DEFAULT 0;
