-- Photo-to-clay by a vision model returns coloured clay parts (a layout), not a GLB file.
ALTER TABLE ai_model_jobs ADD COLUMN layout jsonb;
-- A clay work shared from the bench also keeps its coloured parts, so a remix opens in colour.
ALTER TABLE gallery_works ADD COLUMN recipe jsonb;
