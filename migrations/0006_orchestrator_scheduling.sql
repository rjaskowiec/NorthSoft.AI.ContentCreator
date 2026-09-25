-- NorthSoft.AI.ContentCreator — Orchestrator & Scheduling Schema Migration
-- Migration: 0006_orchestrator_scheduling
--
-- Creates orchestrator_runs table for tracking autonomous content execution pipelines,
-- concurrency locks, and execution metrics.

CREATE TABLE IF NOT EXISTS orchestrator_runs (
  id TEXT PRIMARY KEY,
  trigger_type TEXT NOT NULL DEFAULT 'cron', -- cron | manual
  status TEXT NOT NULL, -- running | completed | deferred | failed
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at TEXT,
  topics_discovered INTEGER NOT NULL DEFAULT 0,
  topics_eligible INTEGER NOT NULL DEFAULT 0,
  topics_selected INTEGER NOT NULL DEFAULT 0,
  writer_calls INTEGER NOT NULL DEFAULT 0,
  qa_calls INTEGER NOT NULL DEFAULT 0,
  policy_calls INTEGER NOT NULL DEFAULT 0,
  regenerations INTEGER NOT NULL DEFAULT 0,
  neurons_used INTEGER NOT NULL DEFAULT 0,
  result_status TEXT, -- approved | deferred | blocked | rejected | no_topic | failed
  post_id TEXT REFERENCES posts(id),
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_orchestrator_runs_started ON orchestrator_runs(started_at);
CREATE INDEX IF NOT EXISTS idx_orchestrator_runs_status ON orchestrator_runs(status);
