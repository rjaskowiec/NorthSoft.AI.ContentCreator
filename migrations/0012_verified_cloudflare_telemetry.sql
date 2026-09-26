-- NorthSoft.AI.ContentCreator — Verified Cloudflare Telemetry Schema Migration
-- Migration: 0012_verified_cloudflare_telemetry
--
-- Adds explicit data source tracking to distinguish application-side estimates
-- from Cloudflare-verified telemetry data.

ALTER TABLE ai_usage ADD COLUMN source TEXT NOT NULL DEFAULT 'local_estimate';
ALTER TABLE ai_runs ADD COLUMN source TEXT NOT NULL DEFAULT 'local_estimate';
ALTER TABLE ai_runs ADD COLUMN estimated_tokens INTEGER NOT NULL DEFAULT 0;

ALTER TABLE orchestrator_runs ADD COLUMN estimated_tokens INTEGER NOT NULL DEFAULT 0;
ALTER TABLE orchestrator_runs ADD COLUMN cloudflare_verified_neurons REAL;
ALTER TABLE orchestrator_runs ADD COLUMN usage_source TEXT NOT NULL DEFAULT 'local_estimate';
