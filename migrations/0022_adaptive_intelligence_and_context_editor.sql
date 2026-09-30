-- Migration 0022: Adaptive Content Intelligence & Guidelines Priority
-- Enhances generator reference posts with confidence scoring and guidelines priority.

ALTER TABLE generator_reference_posts ADD COLUMN confidence REAL NOT NULL DEFAULT 1.0;
ALTER TABLE generator_reference_posts ADD COLUMN reference_value REAL NOT NULL DEFAULT 1.0;

ALTER TABLE generator_guidelines ADD COLUMN priority INTEGER NOT NULL DEFAULT 1;
ALTER TABLE generator_guidelines ADD COLUMN author TEXT NOT NULL DEFAULT 'admin';

CREATE INDEX IF NOT EXISTS idx_gen_ref_posts_value ON generator_reference_posts(is_active, classification, reference_value DESC);
