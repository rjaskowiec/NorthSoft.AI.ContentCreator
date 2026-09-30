-- Migration 0020: Content Intelligence & Generator Insights Extension
-- Adds active reference pools, maturation tracking, learned vs manual guidelines, and prompt template versioning.

-- 1. Generator Reference Posts Pool (Strong & Weak Examples)
CREATE TABLE IF NOT EXISTS generator_reference_posts (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  classification TEXT NOT NULL CHECK (classification IN ('STRONG', 'WEAK')),
  success_score REAL NOT NULL,
  percentile REAL NOT NULL,
  exposure_views INTEGER NOT NULL DEFAULT 0,
  weighted_engagement REAL NOT NULL DEFAULT 0,
  reason_for_inclusion TEXT NOT NULL,
  extracted_characteristics TEXT, -- JSON object: hook_style, length, bullet_usage, etc.
  rank INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  evaluated_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_gen_ref_posts_active ON generator_reference_posts(is_active, classification, rank);

-- 2. Generator Guidelines (Learned & Manual Guidelines with Tier Priorities)
CREATE TABLE IF NOT EXISTS generator_guidelines (
  id TEXT PRIMARY KEY,
  tier TEXT NOT NULL CHECK (tier IN ('SYSTEM', 'MANUAL', 'LEARNED')),
  category TEXT NOT NULL CHECK (category IN ('DO_MORE', 'AVOID', 'STYLE', 'STRUCTURE', 'BENCHMARK')),
  guideline_text TEXT NOT NULL,
  evidence_count INTEGER NOT NULL DEFAULT 1,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_by TEXT NOT NULL DEFAULT 'system',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_gen_guidelines_active ON generator_guidelines(is_active, tier);

-- 3. Prompt Template Versioning (Audit/Versioning for Generator Prompts)
CREATE TABLE IF NOT EXISTS generator_prompt_versions (
  id TEXT PRIMARY KEY,
  version_number INTEGER NOT NULL,
  component_name TEXT NOT NULL, -- e.g., 'system_instructions', 'style_guidelines', 'performance_feedback'
  content TEXT NOT NULL,
  author TEXT NOT NULL DEFAULT 'admin',
  change_summary TEXT,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_prompt_versions_comp ON generator_prompt_versions(component_name, is_active);
