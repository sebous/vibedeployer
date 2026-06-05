-- vibedeployer D1 schema

CREATE TABLE IF NOT EXISTS users (
  id           TEXT PRIMARY KEY,
  email        TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id         TEXT PRIMARY KEY,         -- random session token
  user_id    TEXT NOT NULL REFERENCES users(id),
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS api_keys (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id),
  name         TEXT NOT NULL,
  prefix       TEXT NOT NULL,          -- first chars, shown in UI for identification
  key_hash     TEXT NOT NULL,          -- sha-256 of full key
  created_at   INTEGER NOT NULL,
  last_used_at INTEGER,
  revoked      INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_apikeys_user ON api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_apikeys_hash ON api_keys(key_hash);

CREATE TABLE IF NOT EXISTS docs (
  id             TEXT PRIMARY KEY,
  owner_id       TEXT NOT NULL REFERENCES users(id),
  slug           TEXT NOT NULL UNIQUE,  -- auto-generated random short slug
  custom_slug    TEXT UNIQUE,           -- optional user-chosen slug
  title          TEXT NOT NULL,
  latest_version INTEGER NOT NULL DEFAULT 0,
  visibility     TEXT NOT NULL DEFAULT 'public',
  password_hash  TEXT,                  -- optional: PBKDF2 hash; when set, viewers must enter the password (one password per doc, all versions)
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_docs_owner ON docs(owner_id);

CREATE TABLE IF NOT EXISTS versions (
  id           TEXT PRIMARY KEY,
  doc_id       TEXT NOT NULL REFERENCES docs(id),
  version      INTEGER NOT NULL,
  r2_key       TEXT NOT NULL,
  size         INTEGER NOT NULL,
  content_hash TEXT NOT NULL,
  comment      TEXT,
  created_at   INTEGER NOT NULL,
  UNIQUE(doc_id, version)
);
CREATE INDEX IF NOT EXISTS idx_versions_doc ON versions(doc_id);
