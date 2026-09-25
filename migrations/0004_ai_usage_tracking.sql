-- NorthSoft.AI.ContentCreator — AI Usage & Quota Tracking Schema
-- Migration: 0004_ai_usage_tracking
--
-- Table: ai_usage
-- Tracks AI request volume, token counts, failures, and daily/monthly aggregates
-- to strictly enforce MAX_ALLOWED_AI_COST = 0 and prevent paid AI exhaustion.

CREATE TABLE IF NOT EXISTS ai_usage (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'researcher',
  date TEXT NOT NULL, -- YYYY-MM-DD format
  request_count INTEGER NOT NULL DEFAULT 0,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(provider, model, role, date)
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_date ON ai_usage(date);
CREATE INDEX IF NOT EXISTS idx_ai_usage_provider_date ON ai_usage(provider, date);
