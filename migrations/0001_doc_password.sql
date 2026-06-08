-- Adds per-doc password protection. Run once on existing deployments:
--   wrangler d1 execute vibedeployer-db --remote --file=./migrations/0001_doc_password.sql
-- Fresh installs already get this column from schema.sql.
ALTER TABLE docs ADD COLUMN password_hash TEXT;
