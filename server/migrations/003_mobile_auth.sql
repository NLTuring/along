-- Native bearer sessions are deliberately separate from HttpOnly browser cookies.
-- Existing sessions remain web sessions; no raw credential is stored in the database.
ALTER TABLE sessions ADD COLUMN client_kind text NOT NULL DEFAULT 'web' CHECK (client_kind IN ('web', 'mobile'));
ALTER TABLE sessions ADD COLUMN native_origin text;
ALTER TABLE sessions ADD CONSTRAINT sessions_native_origin CHECK ((client_kind = 'web' AND native_origin IS NULL) OR (client_kind = 'mobile' AND native_origin = 'https://appassets.androidplatform.net'));
