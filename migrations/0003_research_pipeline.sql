-- NorthSoft.AI.ContentCreator — Research Pipeline Schema
-- Migration: 0003_research_pipeline
--
-- Tables:
--   research_sources  — Configurable RSS/API research sources
--   research_items    — Fetched and normalized research material
--   research_runs     — Execution log of research runs (cron/manual)

-- ============================================================
-- Research Sources
-- ============================================================
CREATE TABLE IF NOT EXISTS research_sources (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  url TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL DEFAULT 'rss', -- rss | api | json
  category TEXT NOT NULL DEFAULT 'General', -- AI | Cloudflare | WebDev | Security | NET | SoftwareEngineering | SaaS | Automation
  enabled INTEGER NOT NULL DEFAULT 1, -- 1 = true, 0 = false
  priority INTEGER NOT NULL DEFAULT 0,
  last_checked_at TEXT,
  last_status TEXT NOT NULL DEFAULT 'never_run', -- success | failed | never_run
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_research_sources_enabled ON research_sources(enabled);
CREATE INDEX IF NOT EXISTS idx_research_sources_category ON research_sources(category);

-- ============================================================
-- Research Items (Fetched Articles/Feeds)
-- ============================================================
CREATE TABLE IF NOT EXISTS research_items (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES research_sources(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  url_hash TEXT NOT NULL UNIQUE, -- SHA-256 of canonical URL for deduplication
  content_summary TEXT,
  published_at TEXT,
  fetched_at TEXT NOT NULL DEFAULT (datetime('now')),
  status TEXT NOT NULL DEFAULT 'NEW' -- NEW | ANALYZED | DUPLICATE | FAILED | REJECTED
);

CREATE INDEX IF NOT EXISTS idx_research_items_url_hash ON research_items(url_hash);
CREATE INDEX IF NOT EXISTS idx_research_items_source_id ON research_items(source_id);
CREATE INDEX IF NOT EXISTS idx_research_items_status ON research_items(status);

-- ============================================================
-- Research Runs (Audit & Idempotency)
-- ============================================================
CREATE TABLE IF NOT EXISTS research_runs (
  id TEXT PRIMARY KEY,
  trigger_type TEXT NOT NULL DEFAULT 'cron', -- cron | manual
  status TEXT NOT NULL DEFAULT 'running', -- running | completed | failed
  sources_checked INTEGER NOT NULL DEFAULT 0,
  items_found INTEGER NOT NULL DEFAULT 0,
  topics_created INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_research_runs_status ON research_runs(status);
CREATE INDEX IF NOT EXISTS idx_research_runs_started_at ON research_runs(started_at);

-- Insert initial curated seed sources (safe, public RSS feeds)
INSERT OR IGNORE INTO research_sources (id, name, url, type, category, enabled, priority) VALUES
  ('src-cloudflare-blog', 'Cloudflare Blog', 'https://blog.cloudflare.com/rss/', 'rss', 'Cloudflare', 1, 10),
  ('src-github-blog', 'GitHub Engineering Blog', 'https://github.blog/category/engineering/feed/', 'rss', 'SoftwareEngineering', 1, 9),
  ('src-microsoft-dotnet', '.NET Blog', 'https://devblogs.microsoft.com/dotnet/feed/', 'rss', 'NET', 1, 8),
  ('src-openai-news', 'OpenAI News', 'https://openai.com/news/rss.xml', 'rss', 'AI', 1, 10);
