-- NorthSoft.AI.ContentCreator — Meta Publisher Schema Migration
-- Migration: 0007_meta_publisher
--
-- Enhances publications table with post_version_id, provider, idempotency_key,
-- retry attempt tracking, and detailed error fields for Meta Graph API integration.

ALTER TABLE publications ADD COLUMN post_version_id TEXT REFERENCES post_versions(id);
ALTER TABLE publications ADD COLUMN provider TEXT NOT NULL DEFAULT 'facebook';
ALTER TABLE publications ADD COLUMN attempt_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE publications ADD COLUMN http_status INTEGER;
ALTER TABLE publications ADD COLUMN error_code TEXT;
ALTER TABLE publications ADD COLUMN idempotency_key TEXT;
ALTER TABLE publications ADD COLUMN updated_at TEXT NOT NULL DEFAULT (datetime('now'));

CREATE INDEX IF NOT EXISTS idx_publications_status ON publications(status);
CREATE INDEX IF NOT EXISTS idx_publications_post_version_id ON publications(post_version_id);
CREATE INDEX IF NOT EXISTS idx_publications_idempotency ON publications(idempotency_key);
