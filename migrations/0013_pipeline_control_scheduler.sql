-- NorthSoft.AI.ContentCreator — Pipeline Control & Scheduler Migration
-- Migration: 0013_pipeline_control_scheduler

-- 1. Scheduler configuration table
CREATE TABLE IF NOT EXISTS pipeline_scheduler_config (
  id TEXT PRIMARY KEY DEFAULT 'default',
  enabled INTEGER NOT NULL DEFAULT 0,
  discovery_enabled INTEGER NOT NULL DEFAULT 1,
  generation_enabled INTEGER NOT NULL DEFAULT 1,
  evaluation_enabled INTEGER NOT NULL DEFAULT 1,
  publishing_enabled INTEGER NOT NULL DEFAULT 1,
  frequency TEXT NOT NULL DEFAULT 'daily', -- daily | 12h | 6h
  publication_time TEXT NOT NULL DEFAULT '09:00',
  timezone TEXT NOT NULL DEFAULT 'UTC',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO pipeline_scheduler_config (id, enabled, discovery_enabled, generation_enabled, evaluation_enabled, publishing_enabled, frequency, publication_time, timezone, updated_at)
VALUES ('default', 0, 1, 1, 1, 1, 'daily', '09:00', 'UTC', datetime('now'));

-- 2. Pipeline execution lock table for idempotency protection
CREATE TABLE IF NOT EXISTS pipeline_execution_locks (
  lock_key TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  actor TEXT NOT NULL DEFAULT 'system',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pipeline_locks_expires ON pipeline_execution_locks(expires_at);
