ALTER TABLE craft_jobs ADD COLUMN person_detection jsonb;
-- Persist the provider-attempt boundary: a retried/stalled job must never spend a second detection call.
ALTER TABLE craft_jobs ADD COLUMN detection_attempted boolean NOT NULL DEFAULT false;
