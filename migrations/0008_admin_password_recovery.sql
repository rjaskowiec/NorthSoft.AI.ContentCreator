-- NorthSoft.AI.ContentCreator — Admin Password Recovery Schema
-- Migration: 0008_admin_password_recovery
--
-- Adds email support to admin_users and creates password reset tokens table.

-- 1. Add email column to admin_users
ALTER TABLE admin_users ADD COLUMN email TEXT;

-- 2. Create index for email lookup
CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_users_email ON admin_users(email) WHERE email IS NOT NULL;

-- 3. Password reset tokens table (Hashed token storage for entropy & single-use guarantee)
CREATE TABLE IF NOT EXISTS admin_password_reset_tokens (
  id TEXT PRIMARY KEY,
  admin_user_id TEXT NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_reset_tokens_hash ON admin_password_reset_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_reset_tokens_user_id ON admin_password_reset_tokens(admin_user_id);
CREATE INDEX IF NOT EXISTS idx_reset_tokens_expires ON admin_password_reset_tokens(expires_at);
