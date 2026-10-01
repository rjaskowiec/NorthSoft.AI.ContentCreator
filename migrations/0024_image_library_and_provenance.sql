-- NorthSoft.AI.ContentCreator — Curated Image Library & Provenance Extension
-- Migration: 0024_image_library_and_provenance

-- ============================================================
-- Curated Image Library Table
-- ============================================================
CREATE TABLE IF NOT EXISTS curated_images (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'DISCOVERED', -- DISCOVERED | UPLOADED | URL
  source_url TEXT,
  original_page_url TEXT,
  author TEXT,
  author_url TEXT,
  license TEXT,
  license_url TEXT,
  category TEXT NOT NULL DEFAULT 'General',
  secondary_categories TEXT,
  keywords TEXT,
  tags TEXT,
  description TEXT,
  notes TEXT,
  r2_key TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING', -- PENDING | APPROVED | REJECTED | DELETED
  discovery_query TEXT,
  discovery_score REAL DEFAULT 0,
  usage_count INTEGER NOT NULL DEFAULT 0,
  last_used_at TEXT,
  used_in_post_id TEXT,
  reserved_post_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_curated_images_status ON curated_images(status);
CREATE INDEX IF NOT EXISTS idx_curated_images_category ON curated_images(category);
CREATE INDEX IF NOT EXISTS idx_curated_images_reserved ON curated_images(reserved_post_id);

-- ============================================================
-- Post Images Extensions
-- ============================================================
ALTER TABLE post_images ADD COLUMN curated_image_id TEXT REFERENCES curated_images(id);
ALTER TABLE post_images ADD COLUMN selection_source TEXT DEFAULT 'AUTO'; -- AUTO | MANUAL

-- Backfill existing post_images into curated_images as APPROVED assets for backward compatibility
INSERT OR IGNORE INTO curated_images (
  id, title, source_type, source_url, original_page_url, author, author_url,
  license, license_url, category, description, status, usage_count, created_at, updated_at
)
SELECT
  id,
  COALESCE(alt_text, 'Post Image'),
  'URL',
  url,
  source_url,
  author,
  author_url,
  license,
  license_url,
  'General',
  alt_text,
  'APPROVED',
  1,
  created_at,
  created_at
FROM post_images
WHERE url IS NOT NULL;

UPDATE post_images
SET curated_image_id = id
WHERE curated_image_id IS NULL AND url IS NOT NULL;
