-- Migration 0021: Intelligent Content Scheduling Extension
-- Adds metadata for decision trace logging in schedules table.

ALTER TABLE schedules ADD COLUMN decision_metadata TEXT;
