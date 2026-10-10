-- Adds teams (companies), Google sign-in, and per-doc access modes.
-- Run once on existing deployments:
--   wrangler d1 execute vibedeployer-db --remote --file=./migrations/0002_teams.sql
-- Fresh installs already get all of this from schema.sql.

CREATE TABLE IF NOT EXISTS teams (
  id             TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  sign_in_method TEXT NOT NULL DEFAULT 'google',
  created_at     INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS team_domains (
  domain  TEXT PRIMARY KEY,
  team_id TEXT NOT NULL REFERENCES teams(id)
);
CREATE INDEX IF NOT EXISTS idx_team_domains_team ON team_domains(team_id);

ALTER TABLE users ADD COLUMN google_sub TEXT;
ALTER TABLE users ADD COLUMN google_hd TEXT;
ALTER TABLE users ADD COLUMN team_id TEXT REFERENCES teams(id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_sub ON users(google_sub);
CREATE INDEX IF NOT EXISTS idx_users_team ON users(team_id);

ALTER TABLE docs ADD COLUMN team_id TEXT REFERENCES teams(id);
ALTER TABLE docs ADD COLUMN legacy INTEGER NOT NULL DEFAULT 0;

-- Docs that already had a password keep "password for everyone".
UPDATE docs SET visibility = 'password' WHERE password_hash IS NOT NULL;
-- Remaining public docs stay public until an admin runs
-- "Migrate legacy docs" on /admin (needs teams to exist first).
UPDATE docs SET legacy = 1 WHERE visibility = 'public';

-- Email/password login is removed; force everyone to sign in with Google.
DELETE FROM sessions;
