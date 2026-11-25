-- AI 3D jobs can start from a photo, frames of a short video, or a written description,
-- and report which AI stage they are in (draft by the first AI, refine by the second).
ALTER TABLE ai_model_jobs ADD COLUMN kind text NOT NULL DEFAULT 'image';
ALTER TABLE ai_model_jobs ADD COLUMN stage text;
