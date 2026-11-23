CREATE TABLE users (
  id text PRIMARY KEY, email text NOT NULL UNIQUE, display_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE sessions (
  token_hash text PRIMARY KEY, user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  csrf_token text NOT NULL, expires_at bigint NOT NULL
);
CREATE INDEX sessions_expiry ON sessions(expires_at);
CREATE TABLE otp_challenges (
  email_hash text PRIMARY KEY, code_hash text NOT NULL, expires_at bigint NOT NULL,
  tries integer NOT NULL DEFAULT 0, sent_at bigint NOT NULL, locked_until bigint NOT NULL DEFAULT 0
);
CREATE TABLE rate_limits (
  key text PRIMARY KEY, window_start bigint NOT NULL, hits integer NOT NULL
);
CREATE TABLE media (
  id text PRIMARY KEY, owner_id text NOT NULL REFERENCES users(id), kind text NOT NULL CHECK (kind IN ('IMAGE','VIDEO')),
  purpose text NOT NULL CHECK (purpose IN ('COMMUNITY','CRAFT')), status text NOT NULL CHECK (status IN ('PROCESSING','READY','FAILED')),
  object_key text NOT NULL, poster_key text, mime text NOT NULL, size bigint NOT NULL,
  width integer, height integer, duration double precision, error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE posts (
  id text PRIMARY KEY, owner_id text NOT NULL REFERENCES users(id), title text NOT NULL,
  body text NOT NULL, city text NOT NULL, tags jsonb NOT NULL, poi_id text,
  status text NOT NULL CHECK (status IN ('DRAFT','PENDING','PUBLIC','REJECTED','HIDDEN')),
  review_note text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX posts_feed ON posts(status, created_at, id);
CREATE TABLE post_media (
  post_id text NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  media_id text NOT NULL REFERENCES media(id), position integer NOT NULL,
  PRIMARY KEY(post_id, media_id)
);
CREATE INDEX post_media_media ON post_media(media_id);
CREATE TABLE reactions (
  post_id text NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('LIKE','SAVE')), PRIMARY KEY(post_id,user_id,kind)
);
CREATE TABLE comments (
  id text PRIMARY KEY, post_id text NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  owner_id text NOT NULL REFERENCES users(id), body text NOT NULL,
  status text NOT NULL CHECK (status IN ('PENDING','PUBLIC','REJECTED','HIDDEN')),
  review_note text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX comments_post ON comments(post_id, status);
CREATE TABLE reports (
  id text PRIMARY KEY, owner_id text NOT NULL REFERENCES users(id), target_type text NOT NULL CHECK (target_type IN ('POST','COMMENT')),
  target_id text NOT NULL, reason text NOT NULL, resolved boolean NOT NULL DEFAULT false, resolution text,
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(owner_id,target_type,target_id)
);
CREATE TABLE craft_jobs (
  id text PRIMARY KEY, owner_id text NOT NULL REFERENCES users(id), source_media_id text NOT NULL REFERENCES media(id),
  input_version text NOT NULL, variant text NOT NULL CHECK (variant IN ('REAL','ANIME')),
  idempotency_key text NOT NULL, request_hash text NOT NULL,
  status text NOT NULL CHECK (status IN ('QUEUED','PROCESSING','READY','FAILED','CANCELLED')),
  stage text NOT NULL, run_token text, output_media_id text REFERENCES media(id), mask_media_id text REFERENCES media(id), error text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(owner_id,idempotency_key)
);
CREATE TABLE model_counters (
  owner_id text NOT NULL REFERENCES users(id), local_craft_id text NOT NULL, version integer NOT NULL,
  PRIMARY KEY(owner_id,local_craft_id)
);
CREATE TABLE craft_models (
  id text PRIMARY KEY, owner_id text NOT NULL REFERENCES users(id), local_craft_id text NOT NULL,
  version integer NOT NULL, input_version text NOT NULL, glb_key text NOT NULL, stl_key text NOT NULL,
  glb_size bigint NOT NULL, stl_size bigint NOT NULL, glb_sha256 text NOT NULL, stl_sha256 text NOT NULL,
  metadata jsonb NOT NULL, validation jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(owner_id,local_craft_id,version)
);
CREATE TABLE inquiries (
  id text PRIMARY KEY, owner_id text NOT NULL REFERENCES users(id), model_id text NOT NULL REFERENCES craft_models(id),
  model_version integer NOT NULL, status text NOT NULL CHECK (status IN ('REQUESTED','NEEDS_INFO','QUOTED','CONFIRMED','PRODUCING','SHIPPED','COMPLETED','CANCELLED')),
  revision integer NOT NULL DEFAULT 0, idempotency_key text NOT NULL, request_hash text NOT NULL,
  details jsonb NOT NULL, quote jsonb, tracking jsonb,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(owner_id,idempotency_key)
);
CREATE INDEX inquiries_owner ON inquiries(owner_id,created_at);
CREATE TABLE inquiry_quotes (
  inquiry_id text NOT NULL REFERENCES inquiries(id), revision integer NOT NULL,
  quote jsonb NOT NULL, created_by text NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(inquiry_id,revision)
);
CREATE TABLE audit_events (
  id text PRIMARY KEY, actor_id text REFERENCES users(id), action text NOT NULL, resource_id text NOT NULL,
  from_status text, to_status text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE job_outbox (
  id text PRIMARY KEY, task text NOT NULL CHECK (task IN ('MEDIA','CRAFT')), resource_id text NOT NULL,
  delivered boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX outbox_pending ON job_outbox(delivered);
