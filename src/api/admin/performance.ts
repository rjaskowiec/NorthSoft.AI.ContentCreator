/**
 * Admin API — Content Performance Engine Route Handler
 */

import { Hono } from 'hono';
import type { AppEnv } from '../../index';
import { csrfProtection } from '../../core/auth/csrf';
import { PerformanceEngineService, type PerformanceMetricInput } from '../../services/analytics/performance-engine';

export const performanceRouter = new Hono<AppEnv>();

/**
 * GET /api/admin/performance
 * Returns active Content Performance Profile, summary metrics, and recent post evaluation snapshots.
 */
performanceRouter.get('/performance', async (c) => {
  const db = c.env.DB;
  const engine = new PerformanceEngineService();

  const profile = await engine.getActiveProfile(db);
  const snapshotsRes = await db
    .prepare(
      `SELECT pm.*, p.title as post_title
       FROM post_performance_metrics pm
       JOIN posts p ON p.id = pm.post_id
       ORDER BY pm.measured_at DESC LIMIT 50`,
    )
    .all();

  return c.json({
    activeProfile: profile,
    snapshots: snapshotsRes.results || [],
    evaluatedAt: new Date().toISOString(),
  });
});

/**
 * POST /api/admin/performance/evaluate
 * Triggers re-evaluation of post metrics, dynamic benchmark calculation, and performance profile generation.
 */
performanceRouter.post('/performance/evaluate', csrfProtection, async (c) => {
  const db = c.env.DB;
  const engine = new PerformanceEngineService();

  const profile = await engine.evaluateAndGenerateProfile(db);

  return c.json({
    success: true,
    profile,
  });
});

/**
 * POST /api/admin/performance/metrics
 * Records a performance measurement snapshot for a published post.
 */
performanceRouter.post('/performance/metrics', csrfProtection, async (c) => {
  const db = c.env.DB;
  const body = (await c.req.json().catch(() => ({}))) as PerformanceMetricInput;

  const postId = (body.postId || '').trim();
  if (!postId) {
    return c.json({ success: false, error: 'postId is required' }, 400);
  }

  const engine = new PerformanceEngineService();
  const snapshot = await engine.recordMetricSnapshot(db, body);
  const updatedProfile = await engine.evaluateAndGenerateProfile(db);

  return c.json({
    success: true,
    snapshot,
    profile: updatedProfile,
  });
});
