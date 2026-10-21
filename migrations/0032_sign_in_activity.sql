-- NorthSoft.AI.ContentCreator — Account Security Sign-in Activity Schema
-- Migration: 0032_sign_in_activity
--
-- Records recent successful and failed sign-in attempts with trusted source IP
-- and approximate edge geolocation. Bounded retention prevents table bloat.

CREATE TABLE IF NOT EXISTS sign_in_activity (
  id TEXT PRIMARY KEY,
  admin_user_id TEXT REFERENCES admin_users(id) ON DELETE SET NULL,
  username TEXT NOT NULL,
  status TEXT NOT NULL, -- 'success' | 'failed'
  ip_address TEXT NOT NULL,
  city TEXT,
  region TEXT,
  country TEXT,
  user_agent TEXT,
  failure_reason TEXT, -- 'invalid_credentials' | 'rate_limited' | 'disabled_account'
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sign_in_activity_user ON sign_in_activity(admin_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sign_in_activity_username ON sign_in_activity(username, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sign_in_activity_created ON sign_in_activity(created_at DESC);
