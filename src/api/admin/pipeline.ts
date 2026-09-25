/**
 * Admin API — Orchestrator Pipeline Route Handler
 */

import { Hono } from 'hono';
import type { AppEnv } from '../../index';
import { csrfProtection } from '../../core/auth/csrf';
import { ContentOrchestrator } from '../../services/content/content-orchestrator';

export const pipelineRouter = new Hono<AppEnv>();

/**
 * POST /api/admin/pipeline/run
 * Manually triggers the complete autonomous orchestration pipeline.
 * Protected by requireAdmin and csrfProtection.
 */
pipelineRouter.post('/pipeline/run', csrfProtection, async (c) => {
  const db = c.env.DB;
  const orchestrator = new ContentOrchestrator(db, c.env);

  const result = await orchestrator.runPipeline('manual');

  return c.json({
    success: result.status === 'completed',
    result,
  });
});

/**
 * GET /api/admin/pipeline/runs
 * Returns recent autonomous pipeline execution runs.
 */
pipelineRouter.get('/pipeline/runs', async (c) => {
  const db = c.env.DB;
  const runsRes = await db
    .prepare(
      `SELECT id, trigger_type, status, started_at, finished_at, topics_discovered, topics_eligible, topics_selected,
              writer_calls, qa_calls, policy_calls, regenerations, neurons_used, result_status, post_id, error_message
       FROM orchestrator_runs
       ORDER BY started_at DESC
       LIMIT 20`,
    )
    .all();

  return c.json({
    runs: runsRes.results || [],
  });
});

/**
 * GET /api/admin/schedules
 * Returns scheduled posts awaiting future publication.
 */
pipelineRouter.get('/schedules', async (c) => {
  const db = c.env.DB;
  const schedulesRes = await db
    .prepare(
      `SELECT s.id, s.post_id, s.scheduled_at, s.timezone, s.status, s.created_at,
              p.title as post_title, p.quality_score, p.quality_decision, p.current_version
       FROM schedules s
       JOIN posts p ON s.post_id = p.id
       ORDER BY s.scheduled_at ASC
       LIMIT 20`,
    )
    .all();

  return c.json({
    schedules: schedulesRes.results || [],
  });
});
