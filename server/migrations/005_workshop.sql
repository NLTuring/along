-- Craft workshop: points, the shared gallery, AI photo-to-3D jobs and perler bead kit orders.
-- Points are integers. Every change is a ledger row; the account keeps the running balance.
CREATE TABLE point_accounts (
  user_id text PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  balance integer NOT NULL CHECK (balance >= 0),
  grant_month text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE point_ledger (
  id text PRIMARY KEY, user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  delta integer NOT NULL, balance_after integer NOT NULL CHECK (balance_after >= 0),
  reason text NOT NULL CHECK (reason IN ('MONTHLY_GRANT','TOPUP','SPEND','EARN','REFUND')),
  item text NOT NULL, ref text NOT NULL, idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(user_id, idempotency_key)
);
CREATE INDEX point_ledger_user ON point_ledger(user_id, created_at);

CREATE TABLE gallery_works (
  id text PRIMARY KEY, owner_id text NOT NULL REFERENCES users(id),
  kind text NOT NULL CHECK (kind IN ('CLAY','BEADS','MAGNET','KEYCHAIN')),
  title text NOT NULL, story text NOT NULL, city text NOT NULL,
  cover_key text NOT NULL, model_key text, model_size bigint, pattern jsonb,
  price integer NOT NULL CHECK (price >= 0), allow_remix boolean NOT NULL,
  remix_of text REFERENCES gallery_works(id),
  status text NOT NULL CHECK (status IN ('PENDING','PUBLIC','REJECTED','HIDDEN')),
  review_note text, unlocks integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX gallery_feed ON gallery_works(status, created_at, id);
CREATE INDEX gallery_owner ON gallery_works(owner_id, created_at);
CREATE TABLE gallery_unlocks (
  work_id text NOT NULL REFERENCES gallery_works(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  price integer NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(work_id, user_id)
);

CREATE TABLE ai_model_jobs (
  id text PRIMARY KEY, owner_id text NOT NULL REFERENCES users(id),
  provider text NOT NULL, remote_id text,
  status text NOT NULL CHECK (status IN ('QUEUED','RUNNING','READY','FAILED')),
  progress integer NOT NULL DEFAULT 0, error text, model_key text, model_size bigint,
  cost integer NOT NULL, refunded boolean NOT NULL DEFAULT false,
  idempotency_key text NOT NULL, polled_at bigint NOT NULL DEFAULT 0, started_at bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(owner_id, idempotency_key)
);
CREATE INDEX ai_model_jobs_owner ON ai_model_jobs(owner_id, created_at);

CREATE TABLE bead_orders (
  id text PRIMARY KEY, owner_id text NOT NULL REFERENCES users(id),
  status text NOT NULL CHECK (status IN ('PAID_DEMO','PACKING','SHIPPED','CANCELLED')),
  kit text NOT NULL CHECK (kit IN ('BEADS','FULL_KIT')),
  pattern jsonb NOT NULL, amount_cents integer NOT NULL CHECK (amount_cents > 0),
  shipping jsonb NOT NULL, tracking jsonb, idempotency_key text NOT NULL, request_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(owner_id, idempotency_key)
);
CREATE INDEX bead_orders_owner ON bead_orders(owner_id, created_at);
