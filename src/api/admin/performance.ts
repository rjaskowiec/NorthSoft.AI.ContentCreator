/**
 * Admin API — Content Performance & Intelligence Engine Route Handler
 */

import { Hono } from 'hono';
import type { AppEnv } from '../../index';
import { csrfProtection } from '../../core/auth/csrf';
import { PerformanceEngineService, type PerformanceMetricInput, type GeneratorGuideline } from '../../services/analytics/performance-engine';

export const performanceRouter = new Hono<AppEnv>();

/**
 * GET /api/admin/performance
 * Returns active Content Performance Profile, active reference pools, guidelines, and recent evaluation snapshots.
 */
performanceRouter.get('/performance', async (c) => {
  const db = c.env.DB;
  const engine = new PerformanceEngineService();

  let profile = await engine.getActiveProfile(db);
  if (!profile) {
    profile = await engine.evaluateAndGenerateProfile(db);
  }

  const snapshotsRes = await db
    .prepare(
      `SELECT pm.*, p.title as post_title
       FROM post_performance_metrics pm
       JOIN posts p ON p.id = pm.post_id
       ORDER BY pm.measured_at DESC LIMIT 50`,
    )
    .all();

  // Active Strong & Weak Reference Pools
  let strongPosts: any[] = [];
  let weakPosts: any[] = [];
  try {
    const refQuery = `
      SELECT grp.*, p.title as post_title, pv.content as post_content,
             pm.views as latest_views, pm.unique_views as latest_unique_views,
             pm.reactions as latest_reactions, pm.comments as latest_comments,
             pm.shares as latest_shares, pm.clicks as latest_clicks,
             pm.engagement_rate as latest_engagement_rate,
             pm.measured_at as metrics_measured_at
      FROM generator_reference_posts grp
      JOIN posts p ON p.id = grp.post_id
      JOIN post_versions pv ON p.id = pv.post_id AND p.current_version = pv.version_number
      LEFT JOIN post_performance_metrics pm ON pm.id = (
        SELECT id FROM post_performance_metrics WHERE post_id = grp.post_id ORDER BY measured_at DESC LIMIT 1
      )
      WHERE grp.classification = ? AND grp.is_active = 1
      ORDER BY grp.rank ASC`;

    const mapRefRecord = (r: any) => {
      const isMeasured = r.metrics_measured_at != null;
      const exposure = isMeasured
        ? (r.latest_unique_views > 0 ? r.latest_unique_views : r.latest_views || 0)
        : null;
      const weightedEng = isMeasured
        ? PerformanceEngineService.computeWeightedEngagement(
            r.latest_reactions || 0,
            r.latest_comments || 0,
            r.latest_shares || 0,
            r.latest_clicks || 0,
          )
        : null;

      return {
        ...r,
        exposure_views: exposure,
        weighted_engagement: weightedEng,
        is_measured: isMeasured,
      };
    };

    const strongRes = await db.prepare(refQuery).bind('STRONG').all();
    strongPosts = (strongRes.results || []).map(mapRefRecord);

    const weakRes = await db.prepare(refQuery).bind('WEAK').all();
    weakPosts = (weakRes.results || []).map(mapRefRecord);

    // If published posts exist but either active reference pool is unpopulated, evaluate now
    const pubCnt = (await db.prepare("SELECT COUNT(*) as cnt FROM publications WHERE status = 'published'").first<{ cnt: number }>())?.cnt || 0;
    if (pubCnt > 0 && (strongPosts.length === 0 || weakPosts.length === 0 || profile.diagnostics?.evaluatedPostsCount !== pubCnt)) {
      profile = await engine.evaluateAndGenerateProfile(db);
      const refetchedStrong = await db.prepare(refQuery).bind('STRONG').all();
      strongPosts = (refetchedStrong.results || []).map(mapRefRecord);

      const refetchedWeak = await db.prepare(refQuery).bind('WEAK').all();
      weakPosts = (refetchedWeak.results || []).map(mapRefRecord);
    }
  } catch (err) {
    console.warn('Warning fetching generator_reference_posts:', err);
  }

  // Guidelines (Manual & Learned)
  const guidelines: GeneratorGuideline[] = [];
  try {
    const guideRes = await db
      .prepare('SELECT * FROM generator_guidelines WHERE is_active = 1 ORDER BY tier DESC, created_at DESC')
      .all();
    guidelines.push(...((guideRes.results || []) as unknown as GeneratorGuideline[]));
  } catch {
    // Fallback if table pending
  }

  return c.json({
    activeProfile: profile,
    snapshots: snapshotsRes.results || [],
    strongPosts,
    weakPosts,
    guidelines,
    evaluatedAt: new Date().toISOString(),
  });
});

/**
 * GET /api/admin/performance/preview-context
 * Returns exact prompt payload generator context preview that WriterService receives.
 */
performanceRouter.get('/performance/preview-context', async (c) => {
  const db = c.env.DB;
  const engine = new PerformanceEngineService();
  const preview = await engine.buildGeneratorContextPreview(db);

  return c.json({
    success: true,
    previewPayload: preview,
  });
});

/**
 * POST /api/admin/performance/guidelines
 * Adds a manual guideline in generator_guidelines table.
 */
performanceRouter.post('/performance/guidelines', csrfProtection, async (c) => {
  const db = c.env.DB;
  const body = (await c.req.json().catch(() => ({}))) as {
    category?: 'DO_MORE' | 'AVOID' | 'STYLE' | 'STRUCTURE' | 'BENCHMARK';
    guidelineText?: string;
  };

  const category = body.category || 'DO_MORE';
  const text = (body.guidelineText || '').trim();

  if (!text) {
    return c.json({ success: false, error: 'Guideline text is required' }, 400);
  }

  const engine = new PerformanceEngineService();
  const guideline = await engine.addManualGuideline(db, text, category);
  const updatedProfile = await engine.evaluateAndGenerateProfile(db);

  return c.json({
    success: true,
    guideline,
    profile: updatedProfile,
  });
});

/**
 * PUT /api/admin/performance/guidelines/:id
 * Updates an existing manual guideline in generator_guidelines table.
 */
performanceRouter.put('/performance/guidelines/:id', csrfProtection, async (c) => {
  const db = c.env.DB;
  const id = c.req.param('id');
  if (!id) {
    return c.json({ success: false, error: 'Guideline ID is required' }, 400);
  }
  const body = (await c.req.json().catch(() => ({}))) as {
    guidelineText?: string;
    isActive?: boolean;
  };

  const text = (body.guidelineText || '').trim();
  if (!text) {
    return c.json({ success: false, error: 'Guideline text is required' }, 400);
  }

  const engine = new PerformanceEngineService();
  const updated = await engine.updateManualGuideline(db, id, text, body.isActive !== false);
  if (!updated) {
    return c.json({ success: false, error: 'Guideline not found or not editable' }, 404);
  }

  const updatedProfile = await engine.evaluateAndGenerateProfile(db);

  return c.json({
    success: true,
    profile: updatedProfile,
  });
});

/**
 * DELETE /api/admin/performance/guidelines/:id
 * Deactivates/removes a manual guideline.
 */
performanceRouter.delete('/performance/guidelines/:id', csrfProtection, async (c) => {
  const db = c.env.DB;
  const id = c.req.param('id');
  if (!id) {
    return c.json({ success: false, error: 'Guideline ID is required' }, 400);
  }
  const engine = new PerformanceEngineService();

  await engine.deleteManualGuideline(db, id);
  const updatedProfile = await engine.evaluateAndGenerateProfile(db);

  return c.json({
    success: true,
    profile: updatedProfile,
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
