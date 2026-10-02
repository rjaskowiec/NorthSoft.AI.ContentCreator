-- NorthSoft.AI.ContentCreator — Curated Image Historical Usage Count
-- Migration: 0025_image_historical_usage

ALTER TABLE curated_images ADD COLUMN historical_usage_count INTEGER NOT NULL DEFAULT 0;
