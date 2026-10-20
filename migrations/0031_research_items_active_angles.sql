-- NorthSoft.AI.ContentCreator — Research Items Active Angles & Resilience
-- Migration: 0031_research_items_active_angles

-- Ensure research_items has active_angles_count and last_angle_generated_at
-- This fixes the missing column error on INSERT and SELECT in the Content Discovery Pipeline
ALTER TABLE research_items ADD COLUMN active_angles_count INTEGER DEFAULT 0;
ALTER TABLE research_items ADD COLUMN last_angle_generated_at TEXT;

CREATE INDEX IF NOT EXISTS idx_research_items_angles ON research_items(active_angles_count);
