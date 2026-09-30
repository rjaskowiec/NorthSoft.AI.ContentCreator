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

  const profile = await engine.getActiveProfile(db);
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
    const strongRes = await db
      .prepare(
        `SELECT grp.*, p.title as post_title, pv.content as post_content
         FROM generator_reference_posts grp
         JOIN posts p ON p.id = grp.post_id
         JOIN post_versions pv ON p.id = pv.post_id AND p.current_version = pv.version_number
         WHERE grp.classification = 'STRONG' AND grp.is_active = 1
         ORDER BY grp.rank ASC`,
      )
      .all();
    strongPosts = strongRes.results || [];

    const weakRes = await db
      .prepare(
        `SELECT grp.*, p.title as post_title, pv.content as post_content
         FROM generator_reference_posts grp
         JOIN posts p ON p.id = grp.post_id
         JOIN post_versions pv ON p.id = pv.post_id AND p.current_version = pv.version_number
         WHERE grp.classification = 'WEAK' AND grp.is_active = 1
         ORDER BY grp.rank ASC`,
      )
      .all();
    weakPosts = weakRes.results || [];
  } catch {
    // Fallback if schema pending
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
  const profile = await engine.getActiveProfile(db);

  const manualGuidelinesList: string[] = [];
  const learnedGuidelinesList: string[] = [];
  try {
    const mRows = await db
      .prepare("SELECT guideline_text FROM generator_guidelines WHERE tier = 'MANUAL' AND is_active = 1")
      .all<{ guideline_text: string }>();
    manualGuidelinesList.push(...(mRows.results || []).map((r) => r.guideline_text));

    const lRows = await db
      .prepare("SELECT guideline_text FROM generator_guidelines WHERE tier = 'LEARNED' AND is_active = 1")
      .all<{ guideline_text: string }>();
    learnedGuidelinesList.push(...(lRows.results || []).map((r) => r.guideline_text));
  } catch {
    manualGuidelinesList.push(...(profile?.manualGuidelines || []));
    learnedGuidelinesList.push(...(profile?.successfulPatterns || []));
  }

  const systemRules = [
    'Tone: Natural, friendly, human conversational English speaking directly to a small business owner.',
    'Language: MUST be written strictly in English ("en").',
    'FORBIDDEN JARGON: "unlock potential", "digital transformation", "game changer", "scaling your business".',
    'FACT PRESERVATION: Retain 100% accurate statistics from source without inventing fake numbers.',
  ];

  const previewPayload = {
    systemRules,
    manualGuidelines: manualGuidelinesList,
    learnedGuidelines: learnedGuidelinesList,
    successfulPatterns: profile?.successfulPatterns || [],
    failurePatterns: profile?.failurePatterns || [],
    successfulExamples: profile?.successfulExamples || [],
    poorExamples: profile?.poorExamples || [],
    metricsSummary: profile?.metricsSummary || null,
    generatedAt: new Date().toISOString(),
  };

  return c.json({
    success: true,
    previewPayload,
  });
});

/**
 * POST /api/admin/performance/guidelines
 * Adds or updates a manual guideline in generator_guidelines table.
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

  const id = crypto.randomUUID();
  const nowIso = new Date().toISOString();

  await db
    .prepare(
      `INSERT INTO generator_guidelines (id, tier, category, guideline_text, evidence_count, is_active, created_by, created_at, updated_at)
       VALUES (?, 'MANUAL', ?, ?, 1, 1, 'admin', ?, ?)`,
    )
    .bind(id, category, text, nowIso, nowIso)
    .run();

  const engine = new PerformanceEngineService();
  const updatedProfile = await engine.evaluateAndGenerateProfile(db);

  return c.json({
    success: true,
    guidelineId: id,
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

  await db.prepare("UPDATE generator_guidelines SET is_active = 0 WHERE id = ? AND tier = 'MANUAL'").bind(id).run();

  const engine = new PerformanceEngineService();
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
