-- NorthSoft.AI.ContentCreator — Curated Image Legal & Verification Extensions
-- Migration: 0028_image_legal_and_verification.sql

ALTER TABLE curated_images ADD COLUMN requires_attribution INTEGER NOT NULL DEFAULT 0;
ALTER TABLE curated_images ADD COLUMN allows_modifications INTEGER NOT NULL DEFAULT 1;
ALTER TABLE curated_images ADD COLUMN attribution_text TEXT;
ALTER TABLE curated_images ADD COLUMN legal_verification_status TEXT NOT NULL DEFAULT 'UNVERIFIED'; -- UNVERIFIED | VERIFIED | REJECTED
ALTER TABLE curated_images ADD COLUMN visual_relevance_score REAL DEFAULT 0;
ALTER TABLE curated_images ADD COLUMN visual_relevance_reason TEXT;
