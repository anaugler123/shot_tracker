CREATE TABLE password_resets (
 token_hash text PRIMARY KEY CHECK (length(token_hash) = 64),
 user_id uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
 expires_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
