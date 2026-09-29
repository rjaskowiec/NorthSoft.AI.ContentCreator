-- NorthSoft.AI.ContentCreator — Expand Post Images Schema
-- Migration: 0016_expand_post_images

ALTER TABLE post_images ADD COLUMN source_url TEXT;
ALTER TABLE post_images ADD COLUMN source_id TEXT;
ALTER TABLE post_images ADD COLUMN author TEXT;
ALTER TABLE post_images ADD COLUMN author_url TEXT;
ALTER TABLE post_images ADD COLUMN license TEXT;
ALTER TABLE post_images ADD COLUMN license_url TEXT;
ALTER TABLE post_images ADD COLUMN verified_at TEXT;
ALTER TABLE post_images ADD COLUMN verification_status TEXT;
ALTER TABLE post_images ADD COLUMN visual_verification_status TEXT;
ALTER TABLE post_images ADD COLUMN visual_verification_reason TEXT;
ALTER TABLE post_images ADD COLUMN visual_verification_confidence REAL;
