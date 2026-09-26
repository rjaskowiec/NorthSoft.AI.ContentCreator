-- NorthSoft.AI.ContentCreator — Content Discovery & Topic Queue Redesign
-- Migration: 0011_content_discovery_redesign

-- 1. Extend content_ideas with post angle, scoring, and scheduling metadata
ALTER TABLE content_ideas ADD COLUMN short_description TEXT;
ALTER TABLE content_ideas ADD COLUMN content_angle TEXT;
ALTER TABLE content_ideas ADD COLUMN hook TEXT;
ALTER TABLE content_ideas ADD COLUMN content_pillar TEXT;
ALTER TABLE content_ideas ADD COLUMN source_url TEXT;
ALTER TABLE content_ideas ADD COLUMN source_title TEXT;
ALTER TABLE content_ideas ADD COLUMN source_published_at TEXT;
ALTER TABLE content_ideas ADD COLUMN relevance_score INTEGER DEFAULT 50;
ALTER TABLE content_ideas ADD COLUMN engagement_potential INTEGER DEFAULT 50;
ALTER TABLE content_ideas ADD COLUMN commercial_relevance INTEGER DEFAULT 50;
ALTER TABLE content_ideas ADD COLUMN suggested_publish_date TEXT;

CREATE INDEX IF NOT EXISTS idx_content_ideas_pillar ON content_ideas(content_pillar);
CREATE INDEX IF NOT EXISTS idx_content_ideas_suggested_date ON content_ideas(suggested_publish_date);

-- 2. Create content_topic_history for tracking angle cooldowns and publication spacing
CREATE TABLE IF NOT EXISTS content_topic_history (
  id TEXT PRIMARY KEY,
  idea_id TEXT REFERENCES content_ideas(id),
  post_id TEXT REFERENCES posts(id),
  content_pillar TEXT NOT NULL,
  content_angle TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued', -- queued | scheduled | published | expired
  suggested_publish_date TEXT,
  published_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_topic_history_pillar ON content_topic_history(content_pillar);
CREATE INDEX IF NOT EXISTS idx_topic_history_status ON content_topic_history(status);
CREATE INDEX IF NOT EXISTS idx_topic_history_suggested ON content_topic_history(suggested_publish_date);

-- 3. Extend research_items to support source reuse and active angle tracking
ALTER TABLE research_items ADD COLUMN active_angles_count INTEGER DEFAULT 0;
ALTER TABLE research_items ADD COLUMN last_angle_generated_at TEXT;
