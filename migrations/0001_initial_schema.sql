-- NorthSoft.AI.ContentCreator — Initial Schema Migration
-- Migration: 0001_initial_schema
-- 
-- This creates the foundational tables for the content pipeline.
-- All tables are designed for the autonomous AI content workflow.
--
-- Tables:
--   content_ideas     — Topic ideas from research or admin input
--   posts             — Content items in the pipeline
--   post_versions     — Version history for each post
--   quality_checks    — QA results with structured check data
--   sources           — Research sources referenced by posts
--   post_sources      — Junction: posts ↔ sources
--   schedules         — Publication scheduling
--   publications      — Facebook publish attempt records
--   ai_runs           — AI inference audit trail
--   content_settings  — Configurable brand/content settings
--   audit_log         — Comprehensive system audit trail

-- ============================================================
-- Content Ideas
-- ============================================================
CREATE TABLE IF NOT EXISTS content_ideas (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT,
  source_type TEXT NOT NULL DEFAULT 'manual', -- manual | research | ai
  priority INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'new', -- new | accepted | rejected | used
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- Posts
-- ============================================================
CREATE TABLE IF NOT EXISTS posts (
  id TEXT PRIMARY KEY,
  idea_id TEXT REFERENCES content_ideas(id),
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
    -- draft | in_review | approved | scheduled | published | blocked | rejected
  current_version INTEGER NOT NULL DEFAULT 1,
  regeneration_count INTEGER NOT NULL DEFAULT 0,
  quality_score INTEGER,
  quality_decision TEXT, -- PASS | FAIL | BLOCKED
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  blocked_at TEXT,
  blocked_reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_posts_status ON posts(status);
CREATE INDEX IF NOT EXISTS idx_posts_idea_id ON posts(idea_id);

-- ============================================================
-- Post Versions
-- ============================================================
CREATE TABLE IF NOT EXISTS post_versions (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL REFERENCES posts(id),
  version_number INTEGER NOT NULL,
  content TEXT NOT NULL,
  content_type TEXT NOT NULL DEFAULT 'text', -- text | link | photo
  metadata TEXT, -- JSON: hashtags, mentions, link, etc.
  ai_model TEXT,
  ai_provider TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(post_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_post_versions_post_id ON post_versions(post_id);

-- ============================================================
-- Quality Checks
-- ============================================================
CREATE TABLE IF NOT EXISTS quality_checks (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL REFERENCES posts(id),
  post_version_id TEXT NOT NULL REFERENCES post_versions(id),
  attempt_number INTEGER NOT NULL,
  decision TEXT NOT NULL, -- PASS | FAIL | BLOCKED
  score INTEGER NOT NULL,
  checks TEXT NOT NULL, -- JSON: structured check results
  issues TEXT, -- JSON: array of issues found
  required_changes TEXT, -- JSON: array of required changes
  reviewer_model TEXT NOT NULL,
  reviewer_provider TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_quality_checks_post_id ON quality_checks(post_id);

-- ============================================================
-- Sources
-- ============================================================
CREATE TABLE IF NOT EXISTS sources (
  id TEXT PRIMARY KEY,
  url TEXT,
  title TEXT NOT NULL,
  source_type TEXT NOT NULL, -- website | rss | api | manual
  content_summary TEXT,
  reliability_score INTEGER,
  last_accessed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- Post Sources (junction)
-- ============================================================
CREATE TABLE IF NOT EXISTS post_sources (
  post_id TEXT NOT NULL REFERENCES posts(id),
  source_id TEXT NOT NULL REFERENCES sources(id),
  relevance TEXT, -- primary | supporting | background
  PRIMARY KEY (post_id, source_id)
);

-- ============================================================
-- Schedules
-- ============================================================
CREATE TABLE IF NOT EXISTS schedules (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL REFERENCES posts(id) UNIQUE,
  scheduled_at TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  status TEXT NOT NULL DEFAULT 'pending', -- pending | published | cancelled | failed
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_schedules_status ON schedules(status);
CREATE INDEX IF NOT EXISTS idx_schedules_scheduled_at ON schedules(scheduled_at);

-- ============================================================
-- Publications
-- ============================================================
CREATE TABLE IF NOT EXISTS publications (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL REFERENCES posts(id),
  schedule_id TEXT REFERENCES schedules(id),
  facebook_post_id TEXT,
  status TEXT NOT NULL, -- attempted | success | failed
  error_message TEXT,
  published_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_publications_post_id ON publications(post_id);

-- ============================================================
-- AI Runs
-- ============================================================
CREATE TABLE IF NOT EXISTS ai_runs (
  id TEXT PRIMARY KEY,
  role TEXT NOT NULL, -- writer | qa | researcher | policy
  model TEXT NOT NULL,
  provider TEXT NOT NULL,
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  total_tokens INTEGER,
  duration_ms INTEGER,
  entity_type TEXT, -- post | idea | quality_check
  entity_id TEXT,
  status TEXT NOT NULL DEFAULT 'completed', -- completed | failed | timeout
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_ai_runs_entity ON ai_runs(entity_type, entity_id);

-- ============================================================
-- Content Settings (brand configuration)
-- ============================================================
CREATE TABLE IF NOT EXISTS content_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  description TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Insert default brand settings
INSERT OR IGNORE INTO content_settings (key, value, description) VALUES
  ('target_audience', 'Technology professionals, business owners, AI enthusiasts', 'Primary target audience'),
  ('preferred_topics', 'AI, cloud computing, software development, digital transformation, cybersecurity', 'Topics to prioritize'),
  ('forbidden_topics', 'Politics, religion, controversial social issues', 'Topics to avoid'),
  ('tone', 'Professional, knowledgeable, approachable', 'Communication tone'),
  ('language', 'en', 'Primary content language'),
  ('max_post_length', '2000', 'Maximum post character count'),
  ('min_post_length', '100', 'Minimum post character count'),
  ('posts_per_day', '1', 'Target number of posts per day'),
  ('preferred_publish_hours', '9,12,17', 'Preferred hours for publishing (UTC)'),
  ('cta_style', 'Subtle, value-driven', 'Call-to-action style');

-- ============================================================
-- Audit Log
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  actor TEXT NOT NULL DEFAULT 'system', -- system | admin | ai
  details TEXT, -- JSON: event-specific details (NO secrets)
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_audit_log_event_type ON audit_log(event_type);
CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at);
