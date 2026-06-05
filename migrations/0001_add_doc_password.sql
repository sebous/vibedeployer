-- Adds optional per-doc password protection.
-- One password protects a doc (item) across all of its versions; it is not set per version.
-- Safe to run once on an existing database. Fresh installs already get this column from schema.sql.
ALTER TABLE docs ADD COLUMN password_hash TEXT;
