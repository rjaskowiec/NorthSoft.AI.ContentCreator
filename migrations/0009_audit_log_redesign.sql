-- NorthSoft.AI.ContentCreator — Audit Log Schema Extension
-- Migration: 0009_audit_log_redesign
--
-- Extends the audit_log table with structured fields for level, operation,
-- correlation ID, execution duration, and safe diagnostic error metrics.

ALTER TABLE audit_log ADD COLUMN level TEXT DEFAULT 'INFO';
ALTER TABLE audit_log ADD COLUMN operation TEXT;
ALTER TABLE audit_log ADD COLUMN status TEXT;
ALTER TABLE audit_log ADD COLUMN duration_ms INTEGER;
ALTER TABLE audit_log ADD COLUMN correlation_id TEXT;
ALTER TABLE audit_log ADD COLUMN error_code TEXT;
ALTER TABLE audit_log ADD COLUMN error_message TEXT;
ALTER TABLE audit_log ADD COLUMN error_stage TEXT;
ALTER TABLE audit_log ADD COLUMN http_status INTEGER;

CREATE INDEX IF NOT EXISTS idx_audit_log_level ON audit_log(level);
CREATE INDEX IF NOT EXISTS idx_audit_log_correlation_id ON audit_log(correlation_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_operation ON audit_log(operation);
