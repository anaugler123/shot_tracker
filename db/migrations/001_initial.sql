-- Single-team deployment. Run through npm run db:migrate or automatic startup migration.
CREATE TABLE IF NOT EXISTS users (
 id uuid PRIMARY KEY,
 email text NOT NULL UNIQUE CHECK (email = lower(email)),
 name text NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
 password_hash text NOT NULL,
 role text NOT NULL CHECK (role IN ('coach','player')),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sessions (
 token_hash text PRIMARY KEY,
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 expires_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions(expires_at);
CREATE TABLE IF NOT EXISTS invitations (
 token_hash text PRIMARY KEY,
 email text NOT NULL CHECK (email = lower(email)),
 role text NOT NULL CHECK (role IN ('coach','player')),
 created_by uuid NOT NULL REFERENCES users(id),
 expires_at timestamptz NOT NULL,
 used_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS games (
 id text PRIMARY KEY CHECK (length(id) BETWEEN 1 AND 200),
 metadata jsonb NOT NULL CHECK (jsonb_typeof(metadata) = 'object'),
 revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
 updated_by uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS shots (
 game_id text NOT NULL REFERENCES games(id) ON DELETE CASCADE,
 shot_id text NOT NULL,
 end_number integer NOT NULL CHECK (end_number BETWEEN 1 AND 11),
 position integer NOT NULL CHECK (position BETWEEN 0 AND 3),
 stone integer NOT NULL CHECK (stone IN (1,2)),
 turn_target text NOT NULL,
 kind text NOT NULL CHECK (kind IN ('Draw','Hit')),
 shot_type text NOT NULL,
 execution text NOT NULL,
 score integer CHECK (score BETWEEN 0 AND 5),
 deficiency text NOT NULL,
 review_flag text NOT NULL DEFAULT '',
 note text NOT NULL DEFAULT '',
 video_timestamp integer CHECK (video_timestamp >= 0),
 PRIMARY KEY (game_id,shot_id),
 UNIQUE (game_id,end_number,position,stone)
);
CREATE TABLE IF NOT EXISTS end_scores (
 game_id text NOT NULL REFERENCES games(id) ON DELETE CASCADE,
 end_number integer NOT NULL CHECK (end_number BETWEEN 1 AND 11),
 us integer CHECK (us BETWEEN 0 AND 8),
 them integer CHECK (them BETWEEN 0 AND 8),
 PRIMARY KEY (game_id,end_number),
 CHECK (us IS NULL OR them IS NULL OR us = 0 OR them = 0)
);
CREATE OR REPLACE VIEW player_performance AS
 SELECT g.id AS game_id, s.position,
 g.metadata->'players'->>s.position AS player_name,
 count(s.score)::integer AS scored_shots,
 round(sum(s.score)::numeric / nullif(count(s.score)*5,0) * 100,1) AS shooting_percentage,
 count(*) FILTER (WHERE s.execution='Make')::integer AS made_shots
 FROM games g JOIN shots s ON s.game_id=g.id GROUP BY g.id,s.position;
CREATE OR REPLACE VIEW game_results AS
 SELECT g.id, g.metadata->>'event' AS event, g.metadata->>'opponent' AS opponent,
 g.metadata->>'date' AS game_date, sum(e.us)::integer AS us, sum(e.them)::integer AS them,
 count(*) FILTER (WHERE e.us IS NOT NULL AND e.them IS NOT NULL)::integer AS completed_ends
 FROM games g LEFT JOIN end_scores e ON e.game_id=g.id GROUP BY g.id;
