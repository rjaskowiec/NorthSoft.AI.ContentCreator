-- Track Page-side moderation and deletion state without discarding local history.
ALTER TABLE publications ADD COLUMN fb_is_hidden INTEGER NOT NULL DEFAULT 0;
ALTER TABLE publications ADD COLUMN fb_deleted_at TEXT;
