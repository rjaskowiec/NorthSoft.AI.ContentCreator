-- NorthSoft.AI.ContentCreator — Neuron Quota & Pipeline Schema Migration
-- Migration: 0005_neuron_quota_pipeline
--
-- Adds neurons_used tracking to ai_usage and ai_runs tables
-- to enforce the 7,500 Neurons/day hard ceiling for ContentCreator.

ALTER TABLE ai_usage ADD COLUMN neurons_used INTEGER NOT NULL DEFAULT 0;
ALTER TABLE ai_runs ADD COLUMN neurons_used INTEGER NOT NULL DEFAULT 0;
