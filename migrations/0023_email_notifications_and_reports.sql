-- Migration 0023: Email Notifications & Weekly Digest Log Table
-- Tracks sent email notifications and weekly digest reports for idempotency and auditability.

CREATE TABLE IF NOT EXISTS sent_email_reports (
  id TEXT PRIMARY KEY,
  report_key TEXT UNIQUE NOT NULL, -- e.g. 'weekly_digest:2026-W39' or 'pub_notify:post-123'
  report_type TEXT NOT NULL CHECK (report_type IN ('PUBLICATION_NOTIFICATION', 'ERROR_NOTIFICATION', 'WEEKLY_DIGEST')),
  recipient_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('SENT', 'FAILED')),
  error_message TEXT,
  metadata TEXT, -- JSON payload for audit/debugging
  sent_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sent_email_reports_key ON sent_email_reports(report_key);
CREATE INDEX IF NOT EXISTS idx_sent_email_reports_type ON sent_email_reports(report_type, sent_at DESC);
