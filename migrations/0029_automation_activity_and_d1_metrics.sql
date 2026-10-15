-- NorthSoft.AI.ContentCreator — Automation Activity & D1 Metrics Migration
-- Migration: 0029_automation_activity_and_d1_metrics
--
-- Adds structured activity details and D1 metric tracking to orchestrator_runs,
-- and creates an aggregated daily usage table for efficient D1 telemetry.

-- 1. Extend orchestrator_runs with stage, structured details, and D1 metrics
ALTER TABLE orchestrator_runs ADD COLUMN stage TEXT;
ALTER TABLE orchestrator_runs ADD COLUMN details TEXT;
ALTER TABLE orchestrator_runs ADD COLUMN d1_rows_written INTEGER NOT NULL DEFAULT 0;
ALTER TABLE orchestrator_runs ADD COLUMN d1_rows_read INTEGER NOT NULL DEFAULT 0;

-- 2. Daily D1 usage tracking table (1 row per UTC day, updated with batched aggregation)
CREATE TABLE IF NOT EXISTS d1_daily_usage (
  date TEXT PRIMARY KEY,
  rows_written INTEGER NOT NULL DEFAULT 0,
  rows_read INTEGER NOT NULL DEFAULT 0,
  write_queries INTEGER NOT NULL DEFAULT 0,
  read_queries INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 3. Optimization indexes
CREATE INDEX IF NOT EXISTS idx_orchestrator_runs_stage ON orchestrator_runs(stage);
CREATE INDEX IF NOT EXISTS idx_orchestrator_runs_created ON orchestrator_runs(created_at);
