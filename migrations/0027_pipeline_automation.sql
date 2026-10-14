-- NorthSoft.AI.ContentCreator — Pipeline Automation Redesign
-- Migration: 0027_pipeline_automation
--
-- Replaces frequency/publication_time driven scheduling with need-driven nightly automation.
-- AI stages run only inside the nightly window (22:00–23:45 UTC); publication times are chosen
-- by IntelligentSchedulingService. Legacy columns (frequency, publication_time, timezone,
-- *_enabled) are kept for backwards compatibility but are no longer read.

ALTER TABLE pipeline_scheduler_config ADD COLUMN min_topic_backlog INTEGER NOT NULL DEFAULT 5;
ALTER TABLE pipeline_scheduler_config ADD COLUMN target_coverage_days INTEGER NOT NULL DEFAULT 14;
ALTER TABLE pipeline_scheduler_config ADD COLUMN max_posts_per_night INTEGER NOT NULL DEFAULT 3;
