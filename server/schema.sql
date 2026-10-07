CREATE TABLE IF NOT EXISTS sahne_profiles (
  user_id text PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
  bio text NOT NULL DEFAULT '' CHECK (length(bio) <= 500),
  library_version integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sahne_shows (
  show_id integer PRIMARY KEY CHECK (show_id > 0),
  snapshot jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sahne_library (
  user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  show_id integer NOT NULL REFERENCES sahne_shows(show_id),
  entry jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, show_id)
);
CREATE TABLE IF NOT EXISTS sahne_lists (
  user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  list_id text NOT NULL,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  position integer NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, list_id)
);
CREATE TABLE IF NOT EXISTS sahne_ratings (
  user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  show_id integer NOT NULL REFERENCES sahne_shows(show_id),
  score_units smallint NOT NULL CHECK (score_units BETWEEN 2 AND 20),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, show_id)
);
CREATE TABLE IF NOT EXISTS sahne_reactions (
  user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  show_id integer NOT NULL REFERENCES sahne_shows(show_id),
  reaction text NOT NULL CHECK (reaction IN ('dislike','like','love')),
  PRIMARY KEY (user_id, show_id)
);
CREATE TABLE IF NOT EXISTS sahne_follows (
  follower_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  following_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (follower_id, following_id),
  CHECK (follower_id <> following_id)
);
CREATE TABLE IF NOT EXISTS sahne_posts (
  id uuid PRIMARY KEY,
  user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('log','topic','reply','comment')),
  show_id integer REFERENCES sahne_shows(show_id),
  topic_id uuid REFERENCES sahne_posts(id) ON DELETE CASCADE,
  title text CHECK (length(title) <= 180),
  category text NOT NULL DEFAULT 'general' CHECK (category IN ('general','theory','recommendation','question')),
  body text NOT NULL DEFAULT '' CHECK (length(body) <= 5000),
  spoiler boolean NOT NULL DEFAULT false,
  watched_at date,
  score_units smallint CHECK (score_units BETWEEN 2 AND 20),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CHECK ((kind = 'reply') = (topic_id IS NOT NULL)),
  CONSTRAINT sahne_posts_show_required CHECK (kind IN ('topic','reply') OR show_id IS NOT NULL)
);
-- Upgrade the original anonymous constraint as well as keeping repeated migrations safe.
DO $$
DECLARE constraint_name text;
BEGIN
  FOR constraint_name IN SELECT conname FROM pg_constraint
    WHERE conrelid='sahne_posts'::regclass AND contype='c' AND pg_get_constraintdef(oid) LIKE '%show_id%'
  LOOP
    EXECUTE format('ALTER TABLE sahne_posts DROP CONSTRAINT %I',constraint_name);
  END LOOP;
  ALTER TABLE sahne_posts ADD CONSTRAINT sahne_posts_show_required CHECK (kind IN ('topic','reply') OR show_id IS NOT NULL);
END $$;
CREATE TABLE IF NOT EXISTS sahne_likes (
  user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  post_id uuid NOT NULL REFERENCES sahne_posts(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, post_id)
);
CREATE TABLE IF NOT EXISTS sahne_reports (
  user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  post_id uuid NOT NULL REFERENCES sahne_posts(id) ON DELETE CASCADE,
  reason text NOT NULL CHECK (length(reason) BETWEEN 3 AND 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, post_id)
);
CREATE TABLE IF NOT EXISTS sahne_notifications (
  id uuid PRIMARY KEY,
  recipient_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  actor_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('follow','like','reply')),
  post_id uuid REFERENCES sahne_posts(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz,
  CHECK (recipient_id <> actor_id)
);
CREATE TABLE IF NOT EXISTS sahne_write_limits (
  user_id text PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
  window_start timestamptz NOT NULL DEFAULT now(),
  count integer NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS sahne_posts_recent ON sahne_posts (created_at DESC, id DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS sahne_posts_user ON sahne_posts (user_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS sahne_posts_show ON sahne_posts (show_id, kind, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS sahne_posts_topic ON sahne_posts (topic_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS sahne_follows_target ON sahne_follows (following_id);
CREATE INDEX IF NOT EXISTS sahne_notifications_recipient ON sahne_notifications (recipient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS sahne_ratings_show ON sahne_ratings (show_id);

-- Public availability snapshots contain no account or session data.
CREATE TABLE IF NOT EXISTS sahne_watch_cache (
  show_id integer NOT NULL CHECK (show_id > 0),
  country text NOT NULL CHECK (country IN ('TR','US','GB','DE')),
  version integer NOT NULL,
  payload jsonb NOT NULL,
  checked_at timestamptz NOT NULL,
  PRIMARY KEY (show_id,country)
);

-- Public trailers and show artwork; no personal account data.
CREATE TABLE IF NOT EXISTS sahne_media_cache (
  show_id integer PRIMARY KEY CHECK (show_id > 0),
  version integer NOT NULL,
  payload jsonb NOT NULL,
  checked_at timestamptz NOT NULL
);
