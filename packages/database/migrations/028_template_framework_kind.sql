-- Framework templates are now stored in content_templates alongside lesson
-- plans, activities, observations and announcements.
ALTER TABLE content_templates DROP CONSTRAINT IF EXISTS content_templates_kind_check;
ALTER TABLE content_templates ADD CONSTRAINT content_templates_kind_check
  CHECK (kind IN ('lesson_plan', 'activity', 'observation', 'announcement', 'framework'));
