-- NorthSoft.AI.ContentCreator — Content Performance Engine & Topic Lifecycle
-- Migration: 0019_content_performance_engine_and_topic_lifecycle

-- 1. Create post_performance_metrics table for historical performance measurement snapshots
CREATE TABLE IF NOT EXISTS post_performance_metrics (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL REFERENCES posts(id),
  publication_id TEXT REFERENCES publications(id),
  facebook_post_id TEXT,
  measured_at TEXT NOT NULL,
  views INTEGER DEFAULT 0,
  unique_views INTEGER DEFAULT 0,
  reactions INTEGER DEFAULT 0,
  comments INTEGER DEFAULT 0,
  shares INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  engagement_rate REAL DEFAULT 0.0,
  performance_score REAL DEFAULT 0.0,
  relative_performance REAL DEFAULT 1.0,
  classification TEXT DEFAULT 'INSUFFICIENT_DATA', -- INSUFFICIENT_DATA | OUTPERFORMING | STRONG | AVERAGE | WEAK | UNDERPERFORMING
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_post_perf_post_id ON post_performance_metrics(post_id);
CREATE INDEX IF NOT EXISTS idx_post_perf_measured ON post_performance_metrics(measured_at);
CREATE INDEX IF NOT EXISTS idx_post_perf_classification ON post_performance_metrics(classification);

-- 2. Create performance_profiles table for persistent compact guidance artifacts
CREATE TABLE IF NOT EXISTS performance_profiles (
  id TEXT PRIMARY KEY,
  profile_json TEXT NOT NULL,
  is_active INTEGER DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_perf_profiles_active ON performance_profiles(is_active, created_at);
