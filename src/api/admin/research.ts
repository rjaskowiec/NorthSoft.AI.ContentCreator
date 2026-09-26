/**
 * Admin API — Research Route Handler
 */

import { Hono } from 'hono';
import type { AppEnv } from '../../index';
import { getAIProvider } from '../../ai/factory';
import { csrfProtection } from '../../core/auth/csrf';
import { QuotaManager } from '../../services/ai/quota-manager';
import { ResearchService } from '../../services/research/research-service';

export const researchRouter = new Hono<AppEnv>();

/**
 * GET /api/admin/research
 * Returns research sources, candidate topics, research runs, AI quota usage, and metrics.
 */
researchRouter.get('/research', async (c) => {
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
      'SELECT * FROM research_runs ORDER BY started_at DESC LIMIT 10',
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
researchRouter.get('/ai-usage', async (c) => {
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
researchRouter.post('/research/run', csrfProtection, async (c) => {
  const db = c.env.DB;
  const aiProvider = getAIProvider(c.env, 'researcher');
  const service = new ResearchService(db, aiProvider);

  const summary = await service.runResearchPipeline('manual');

  return c.json({
    success: summary.status === 'completed',
    summary,
  });
});
