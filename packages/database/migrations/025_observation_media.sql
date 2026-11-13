-- Observations can carry supporting photos and videos (a child's work sample,
-- a photo of a painting, a clip of an outdoor activity). Store them as a
-- JSON array of URLs, mirroring daily_reports.photo_urls.
ALTER TABLE learner_observations
  ADD COLUMN IF NOT EXISTS photo_urls JSONB NOT NULL DEFAULT '[]'::jsonb;
