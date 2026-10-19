CREATE TABLE teams (
 id text PRIMARY KEY,
 name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 100),
 created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO teams(id,name) VALUES('default','Our team');
CREATE TABLE team_memberships (
 team_id text NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 role text NOT NULL CHECK (role IN ('coach','player')),
 PRIMARY KEY(team_id,user_id)
);
INSERT INTO team_memberships(team_id,user_id,role) SELECT 'default',id,role FROM users;
ALTER TABLE sessions ADD COLUMN active_team_id text NOT NULL DEFAULT 'default' REFERENCES teams(id);
ALTER TABLE invitations ADD COLUMN team_id text NOT NULL DEFAULT 'default' REFERENCES teams(id);
ALTER TABLE games ADD COLUMN team_id text NOT NULL DEFAULT 'default' REFERENCES teams(id);
ALTER TABLE shots ADD COLUMN team_id text NOT NULL DEFAULT 'default' REFERENCES teams(id);
ALTER TABLE end_scores ADD COLUMN team_id text NOT NULL DEFAULT 'default' REFERENCES teams(id);
DROP VIEW player_performance;
DROP VIEW game_results;
ALTER TABLE shots DROP CONSTRAINT shots_game_id_fkey, DROP CONSTRAINT shots_pkey, DROP CONSTRAINT shots_game_id_end_number_position_stone_key;
ALTER TABLE end_scores DROP CONSTRAINT end_scores_game_id_fkey, DROP CONSTRAINT end_scores_pkey;
ALTER TABLE games DROP CONSTRAINT games_pkey, ADD PRIMARY KEY(team_id,id);
ALTER TABLE shots ADD PRIMARY KEY(team_id,game_id,shot_id), ADD UNIQUE(team_id,game_id,end_number,position,stone), ADD FOREIGN KEY(team_id,game_id) REFERENCES games(team_id,id) ON DELETE CASCADE;
ALTER TABLE end_scores ADD PRIMARY KEY(team_id,game_id,end_number), ADD FOREIGN KEY(team_id,game_id) REFERENCES games(team_id,id) ON DELETE CASCADE;
CREATE INDEX games_team_updated_idx ON games(team_id,updated_at DESC);
CREATE OR REPLACE VIEW player_performance AS
 SELECT g.team_id,g.id AS game_id,s.position,
 g.metadata->'players'->>s.position AS player_name,
 count(s.score)::integer AS scored_shots,
 round(sum(s.score)::numeric/nullif(count(s.score)*5,0)*100,1) AS shooting_percentage,
 count(*) FILTER (WHERE s.execution='Make')::integer AS made_shots
 FROM games g JOIN shots s ON s.team_id=g.team_id AND s.game_id=g.id
 GROUP BY g.team_id,g.id,s.position;
CREATE OR REPLACE VIEW game_results AS
 SELECT g.team_id,g.id,g.metadata->>'event' AS event,g.metadata->>'opponent' AS opponent,g.metadata->>'date' AS game_date,
 sum(e.us)::integer AS us,sum(e.them)::integer AS them,
 count(*) FILTER (WHERE e.us IS NOT NULL AND e.them IS NOT NULL)::integer AS completed_ends
 FROM games g LEFT JOIN end_scores e ON e.team_id=g.team_id AND e.game_id=g.id GROUP BY g.team_id,g.id;
