/**
 * NorthSoft.AI.ContentCreator — Admin API Routes
 *
 * Provides system status, content pipeline metrics, recent audit events,
 * content settings, and research management for the Admin Dashboard.
 * Protected by requireAdmin middleware.
 */

import { Hono } from 'hono';
import type { AppEnv } from '../index';
import { getAIProvider } from '../ai/factory';
import { D1AuditLogger } from '../core/audit';
import { csrfProtection } from '../core/auth/csrf';
import { getEnvironment, isFacebookPublishEnabled } from '../core/environment';
import { requireAdmin } from '../core/middleware/auth';
import { QuotaManager } from '../services/ai/quota-manager';
import { ContentOrchestrator } from '../services/content/content-orchestrator';
import { ContentPlannerService } from '../services/content/content-planner-service';
import { ResearchService } from '../services/research/research-service';

export const adminRoutes = new Hono<AppEnv>();

// Apply requireAdmin middleware to all /api/admin/* endpoints
adminRoutes.use('*', requireAdmin);

/**
 * GET /api/admin/dashboard
 * Returns system status, content pipeline counts, recent activity, security status, and AI quota usage.
 */
adminRoutes.get('/dashboard', async (c) => {
  const db = c.env.DB;
  const envName = getEnvironment(c.env?.ENVIRONMENT);
  const fbEnabled = isFacebookPublishEnabled(c.env?.FACEBOOK_PUBLISH_ENABLED, envName);
  const quotaManager = new QuotaManager();
  const aiUsage = await quotaManager.getUsageSummary(db);

  // 1. Check Database connection & query pipeline counts
  let dbConnected = false;
  let pipelineCounts = {
    ideas: 0,
    drafts: 0,
    awaitingQa: 0,
    approved: 0,
    scheduled: 0,
    published: 0,
    blocked: 0,
  };

  try {
    const countsResult = await db
      .prepare(
        `SELECT
          (SELECT COUNT(*) FROM content_ideas) as ideas,
          (SELECT COUNT(*) FROM posts WHERE status = 'draft') as drafts,
          (SELECT COUNT(*) FROM posts WHERE status = 'in_review') as awaiting_qa,
          (SELECT COUNT(*) FROM posts WHERE status = 'approved') as approved,
          (SELECT COUNT(*) FROM posts WHERE status = 'scheduled') as scheduled,
          (SELECT COUNT(*) FROM posts WHERE status = 'published') as published,
          (SELECT COUNT(*) FROM posts WHERE status = 'blocked') as blocked`,
      )
      .first<{
        ideas: number;
        drafts: number;
        awaiting_qa: number;
        approved: number;
        scheduled: number;
        published: number;
        blocked: number;
      }>();

    if (countsResult) {
      dbConnected = true;
      pipelineCounts = {
        ideas: countsResult.ideas || 0,
        drafts: countsResult.drafts || 0,
        awaitingQa: countsResult.awaiting_qa || 0,
        approved: countsResult.approved || 0,
        scheduled: countsResult.scheduled || 0,
        published: countsResult.published || 0,
        blocked: countsResult.blocked || 0,
      };
    }
  } catch {
    dbConnected = false;
  }

  // 2. Fetch Recent Audit Activity
  let recentActivity: Array<{
    id: string;
    eventType: string;
    actor: string;
    timestamp: string;
    summary: string;
  }> = [];

  try {
    const auditLogger = new D1AuditLogger(db);
    const logs = await auditLogger.query({ limit: 10 });
    recentActivity = logs.map((log) => ({
      id: log.id || '',
      eventType: log.eventType,
      actor: log.actor,
      timestamp: log.timestamp,
      summary: `${log.actor.toUpperCase()} performed ${log.eventType} on ${log.entityType}:${log.entityId}`,
    }));
  } catch {
    // Keep default empty array
  }

  // 3. Fetch Last Orchestrator Run Metrics
  let lastRun: Record<string, unknown> | null;
  try {
    const runRow = await db
      .prepare(
        'SELECT id, trigger_type, status, started_at, finished_at, topics_discovered, topics_selected, neurons_used, result_status, error_message FROM orchestrator_runs ORDER BY started_at DESC LIMIT 1',
      )
      .first<Record<string, unknown>>();
    lastRun = runRow || null;
  } catch {
    lastRun = null;
  }

  // AI Provider status
  const aiProvider = getAIProvider(c.env, 'researcher');
  const aiProviderStatus =
    aiProvider.name === 'mock' ? 'Mock (Development)' : `${aiProvider.name.toUpperCase()}`;

  return c.json({
    systemStatus: {
      application: 'NorthSoft AI — Content Creator',
      environment: envName.charAt(0).toUpperCase() + envName.slice(1),
      worker: 'Healthy',
      database: dbConnected ? 'Connected' : 'Error',
      aiProvider: aiProviderStatus,
      facebookPublisher: 'Not configured',
      publishing: fbEnabled ? 'Enabled' : 'Disabled',
    },
    pipeline: pipelineCounts,
    lastRun,
    securityStatus: {
      authentication: 'Enabled',
      sessionType: 'HttpOnly Secure Cookie',
      csrfProtection: 'Enabled',
      bruteForceProtection: 'Enabled (D1 rate limited)',
      facebookPublishing: fbEnabled ? 'ENABLED' : 'DISABLED',
      aiProvider: aiProviderStatus,
      zeroCostConstraint: 'ENFORCED (MAX_ALLOWED_AI_COST = 0)',
    },
    aiUsage,
    recentActivity,
  });
});

/**
 * GET /api/admin/research
 * Returns research sources, candidate topics, research runs, AI quota usage, and metrics.
 */
adminRoutes.get('/research', async (c) => {
  const db = c.env.DB;
  const quotaManager = new QuotaManager();
  const aiUsage = await quotaManager.getUsageSummary(db);

  // 1. Fetch Research Sources
  const sourcesRes = await db
    .prepare(
      'SELECT id, name, url, type, category, enabled, priority, last_checked_at, last_status, last_error FROM research_sources ORDER BY priority DESC',
    )
    .all();

  // 2. Fetch Candidate Topics
  const topicsRes = await db
    .prepare(
      "SELECT id, title, description, category, priority, status, created_at FROM content_ideas WHERE source_type = 'research' ORDER BY created_at DESC LIMIT 20",
    )
    .all();

  // 3. Fetch Recent Research Runs
  const runsRes = await db
    .prepare(
      'SELECT id, trigger_type, status, sources_checked, items_found, topics_created, error_message, started_at, completed_at FROM research_runs ORDER BY started_at DESC LIMIT 10',
    )
    .all();

  const sources = sourcesRes.results || [];
  const topics = topicsRes.results || [];
  const runs = runsRes.results || [];

  const enabledCount = sources.filter((s: Record<string, unknown>) => s.enabled === 1).length;

  return c.json({
    sources,
    topics,
    runs,
    aiUsage,
    stats: {
      totalSources: sources.length,
      enabledSources: enabledCount,
      totalTopicsDiscovered: topics.length,
      lastRunAt: runs.length > 0 ? (runs[0] as Record<string, unknown>).started_at : null,
    },
  });
});

/**
 * GET /api/admin/ai-usage
 * Returns current AI usage counters and remaining free quota limits.
 */
adminRoutes.get('/ai-usage', async (c) => {
  const db = c.env.DB;
  const quotaManager = new QuotaManager();
  const summary = await quotaManager.getUsageSummary(db);

  return c.json({
    usage: summary,
  });
});

/**
 * POST /api/admin/research/run
 * Manually triggers the autonomous research pipeline.
 * Protected by requireAdmin and csrfProtection.
 */
adminRoutes.post('/research/run', csrfProtection, async (c) => {
  const db = c.env.DB;
  const aiProvider = getAIProvider(c.env, 'researcher');
  const service = new ResearchService(db, aiProvider);

  const summary = await service.runResearchPipeline('manual');

  return c.json({
    success: summary.status === 'completed',
    summary,
  });
});

/**
 * POST /api/admin/content/generate
 * Manually triggers the autonomous Writer + QA + Policy pipeline for a candidate topic.
 * Protected by requireAdmin and csrfProtection.
 */
adminRoutes.post('/content/generate', csrfProtection, async (c) => {
  const db = c.env.DB;
  const body = (await c.req.json().catch(() => ({}))) as { topicId?: string };

  if (!body.topicId || typeof body.topicId !== 'string') {
    return c.json({ error: 'Missing required string field: topicId' }, 400);
  }

  const planner = new ContentPlannerService(db, c.env);
  const result = await planner.generatePostFromTopic(body.topicId, 'admin');

  return c.json({
    success: result.status === 'approved',
    result,
  });
});

/**
 * GET /api/admin/content/posts
 * Returns recent generated posts, versions, QA scores, and quality decisions.
 */
adminRoutes.get('/content/posts', async (c) => {
  const db = c.env.DB;
  const postsRes = await db
    .prepare(
      `SELECT p.id, p.idea_id, p.title, p.status, p.current_version, p.quality_score, p.quality_decision, p.created_at, p.updated_at,
              v.content as latest_body, v.ai_provider, v.ai_model
       FROM posts p
       LEFT JOIN post_versions v ON p.id = v.post_id AND p.current_version = v.version_number
       ORDER BY p.created_at DESC
       LIMIT 20`,
    )
    .all();

  return c.json({
    posts: postsRes.results || [],
  });
});

/**
 * GET /api/admin/settings
 * Returns content brand settings.
 */
adminRoutes.get('/settings', async (c) => {
  const db = c.env.DB;
  const rows = await db
    .prepare('SELECT key, value, description, updated_at FROM content_settings ORDER BY key ASC')
    .all<{
      key: string;
      value: string;
      description: string;
      updated_at: string;
    }>();

  return c.json({
    settings: rows.results || [],
  });
});

/**
 * POST /api/admin/pipeline/run
 * Manually triggers the complete autonomous orchestration pipeline.
 * Protected by requireAdmin and csrfProtection.
 */
adminRoutes.post('/pipeline/run', csrfProtection, async (c) => {
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
adminRoutes.get('/pipeline/runs', async (c) => {
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
adminRoutes.get('/schedules', async (c) => {
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
