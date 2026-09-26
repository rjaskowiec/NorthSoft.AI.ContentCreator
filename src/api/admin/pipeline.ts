/**
 * Admin API — Pipeline Control & Automation Route Handler
 */

import { Hono } from 'hono';
import type { AppEnv } from '../../index';
import { csrfProtection } from '../../core/auth/csrf';
import { ContentOrchestrator } from '../../services/content/content-orchestrator';
import { PipelineOrchestratorService } from '../../services/content/pipeline-orchestrator-service';

export const pipelineRouter = new Hono<AppEnv>();

/**
 * POST /api/admin/pipeline/discovery
 * Stage 1: Runs Content Discovery / Scout.
 * Protected by requireAdmin and csrfProtection.
 */
pipelineRouter.post('/pipeline/discovery', csrfProtection, async (c) => {
  const db = c.env.DB;
  const service = new PipelineOrchestratorService(db, c.env);

  try {
    const result = await service.runDiscovery('admin');
    return c.json({ success: true, result });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return c.json(
      {
        success: false,
        error: errorMsg,
        code: errorMsg.startsWith('PIPELINE_ALREADY_RUNNING') ? 'PIPELINE_ALREADY_RUNNING' : 'DISCOVERY_FAILED',
      },
      errorMsg.startsWith('PIPELINE_ALREADY_RUNNING') ? 409 : 500,
    );
  }
});

/**
 * POST /api/admin/pipeline/generate
 * Stage 2: Generates post from a selected idea and runs quality evaluation.
 * Protected by requireAdmin and csrfProtection.
 */
pipelineRouter.post('/pipeline/generate', csrfProtection, async (c) => {
  const db = c.env.DB;
  const body = (await c.req.json().catch(() => ({}))) as { ideaId?: string };
  const service = new PipelineOrchestratorService(db, c.env);

  try {
    const result = await service.runPostGeneration(body.ideaId, 'admin');
    return c.json({
      success: result.finalDecision === 'PASS',
      result,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return c.json(
      {
        success: false,
        error: errorMsg,
        code: errorMsg.startsWith('PIPELINE_ALREADY_RUNNING') ? 'PIPELINE_ALREADY_RUNNING' : 'GENERATION_FAILED',
      },
      errorMsg.startsWith('PIPELINE_ALREADY_RUNNING') ? 409 : 500,
    );
  }
});

/**
 * POST /api/admin/pipeline/publish
 * Stage 3: Publishes an approved post to Facebook.
 * Protected by requireAdmin and csrfProtection.
 */
pipelineRouter.post('/pipeline/publish', csrfProtection, async (c) => {
  const db = c.env.DB;
  const body = (await c.req.json().catch(() => ({}))) as { postId?: string };

  if (!body.postId || typeof body.postId !== 'string') {
    return c.json({ success: false, error: 'Missing required field: postId' }, 400);
  }

  const service = new PipelineOrchestratorService(db, c.env);

  try {
    const result = await service.runPublishing(body.postId, 'admin');
    return c.json({
      success: result.success,
      result,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return c.json(
      {
        success: false,
        error: errorMsg,
        code: errorMsg.startsWith('PIPELINE_ALREADY_RUNNING') ? 'PIPELINE_ALREADY_RUNNING' : 'PUBLISHING_FAILED',
      },
      errorMsg.startsWith('PIPELINE_ALREADY_RUNNING') ? 409 : 500,
    );
  }
});

/**
 * POST /api/admin/pipeline/run-full
 * 1-Click Full Pipeline: Discovery → Select 1 Proposal → Generate → Evaluate → Publish EXACTLY 1 post.
 * Protected by requireAdmin and csrfProtection.
 */
pipelineRouter.post('/pipeline/run-full', csrfProtection, async (c) => {
  const db = c.env.DB;
  const service = new PipelineOrchestratorService(db, c.env);

  const result = await service.runFullPipeline('admin');

  if (result.status === 'PIPELINE_ALREADY_RUNNING') {
    return c.json(
      {
        success: false,
        error: 'PIPELINE_ALREADY_RUNNING: A full pipeline execution is already in progress.',
        code: 'PIPELINE_ALREADY_RUNNING',
        result,
      },
      409,
    );
  }

  return c.json({
    success: result.status === 'SUCCESS',
    result,
  });
});

/**
 * POST /api/admin/pipeline/run
 * Legacy orchestration run endpoint for backwards compatibility.
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
 * GET /api/admin/pipeline/scheduler
 * Returns current scheduler configuration and lock status.
 */
pipelineRouter.get('/pipeline/scheduler', async (c) => {
  const db = c.env.DB;
  const service = new PipelineOrchestratorService(db, c.env);

  const config = await service.getSchedulerConfig();
  return c.json({ config });
});

/**
 * POST /api/admin/pipeline/scheduler
 * Updates automatic scheduler configuration.
 * Protected by requireAdmin and csrfProtection.
 */
pipelineRouter.post('/pipeline/scheduler', csrfProtection, async (c) => {
  const db = c.env.DB;
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const service = new PipelineOrchestratorService(db, c.env);

  const updated = await service.updateSchedulerConfig(body);
  return c.json({ success: true, config: updated });
});

/**
 * GET /api/admin/pipeline/runs & GET /api/admin/pipeline/history
 * Returns recent pipeline execution runs log history.
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

pipelineRouter.get('/pipeline/history', async (c) => {
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
    history: runsRes.results || [],
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
