-- NorthSoft.AI.ContentCreator — Facebook Bidirectional Sync Migration
-- Migration: 0014_facebook_bidirectional_sync
--
-- Adds fields to publications and posts to track Facebook Graph API content synchronization,
-- conflict detection, last check/sync timestamps, and content hashes.

ALTER TABLE publications ADD COLUMN fb_last_check_at TEXT;
ALTER TABLE publications ADD COLUMN fb_last_sync_at TEXT;
ALTER TABLE publications ADD COLUMN sync_status TEXT NOT NULL DEFAULT 'SYNCED'; -- SYNCED | LOCAL_AHEAD | FACEBOOK_AHEAD | SYNC_FAILED | CONFLICT
ALTER TABLE publications ADD COLUMN fb_content_hash TEXT;
ALTER TABLE publications ADD COLUMN pushed_content_hash TEXT;
ALTER TABLE publications ADD COLUMN sync_source TEXT NOT NULL DEFAULT 'ai'; -- ai | facebook | local_user

ALTER TABLE posts ADD COLUMN sync_status TEXT NOT NULL DEFAULT 'SYNCED';
ALTER TABLE posts ADD COLUMN last_synced_at TEXT;

CREATE INDEX IF NOT EXISTS idx_publications_sync_status ON publications(sync_status);
CREATE INDEX IF NOT EXISTS idx_posts_sync_status ON posts(sync_status);
