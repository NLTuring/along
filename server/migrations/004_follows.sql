-- Members following members. A profile shows its public posts and these two counts.
CREATE TABLE follows (
  follower_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  followee_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(follower_id, followee_id),
  CHECK (follower_id <> followee_id)
);
CREATE INDEX follows_followee ON follows(followee_id, created_at);
CREATE INDEX follows_follower ON follows(follower_id, created_at);
CREATE INDEX posts_owner ON posts(owner_id, status, created_at);
