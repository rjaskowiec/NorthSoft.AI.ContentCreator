/**
 * Admin API — Research & Discovery Route Handler
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
 * Returns research sources, queued content ideas, research runs, AI quota usage, and pillar distribution stats.
 */
researchRouter.get('/research', async (c) => {
  const db = c.env.DB;
  const quotaManager = new QuotaManager();
  const aiUsage = await quotaManager.getUsageSummary(db, c.env);

  // 1. Fetch Research Sources
  const sourcesRes = await db
    .prepare(
      'SELECT id, name, url, type, category, enabled, priority, last_checked_at, last_status, last_error FROM research_sources ORDER BY priority DESC',
    )
    .all();

  // 2. Fetch Queued & Discovered Content Ideas
  let topics: Record<string, unknown>[];
  try {
    const topicsRes = await db
      .prepare(
        `SELECT id, title, description, short_description, content_angle, hook, category, content_pillar,
                relevance_score, engagement_potential, commercial_relevance, suggested_publish_date, priority, status, created_at
         FROM content_ideas
         ORDER BY created_at DESC LIMIT 30`,
      )
      .all<Record<string, unknown>>();
    topics = topicsRes.results || [];
  } catch {
    const topicsRes = await db
      .prepare(
        "SELECT id, title, description, category, priority, status, created_at FROM content_ideas WHERE source_type = 'research' ORDER BY created_at DESC LIMIT 20",
      )
      .all<Record<string, unknown>>();
    topics = topicsRes.results || [];
  }

  // 3. Fetch Recent Research Runs
  const runsRes = await db
    .prepare('SELECT * FROM research_runs ORDER BY started_at DESC LIMIT 10')
    .all();

  const sources = sourcesRes.results || [];
  const runs = runsRes.results || [];
  const enabledCount = sources.filter((s: Record<string, unknown>) => s.enabled === 1).length;

  // 4. Calculate Pillar Distribution Breakdown (%)
  const pillarCounts: Record<string, number> = {
    WEBSITE: 0,
    MARKETING: 0,
    SALES: 0,
    AI: 0,
    SMALL_BUSINESS: 0,
    CUSTOMER_EXPERIENCE: 0,
    LOCAL_BUSINESS: 0,
  };

  for (const t of topics) {
    const p = (t.content_pillar as string) || (t.category as string) || 'WEBSITE';
    if (pillarCounts[p] !== undefined) {
      pillarCounts[p] = (pillarCounts[p] || 0) + 1;
    } else if (p === 'AI_AUTOMATION') {
      pillarCounts.AI = (pillarCounts.AI || 0) + 1;
    } else if (p === 'WEB_TECHNOLOGY' || p === 'ONLINE_PRESENCE') {
      pillarCounts.WEBSITE = (pillarCounts.WEBSITE || 0) + 1;
    } else {
      pillarCounts.SMALL_BUSINESS = (pillarCounts.SMALL_BUSINESS || 0) + 1;
    }
  }

  const queuedCount = topics.filter((t) => t.status === 'queued' || t.status === 'new' || t.status === 'discovered').length;

  return c.json({
    sources,
    topics,
    runs,
    aiUsage,
    stats: {
      totalSources: sources.length,
      enabledSources: enabledCount,
      totalTopicsDiscovered: topics.length,
      queuedIdeasCount: queuedCount,
      pillarBreakdown: pillarCounts,
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
  const summary = await quotaManager.getUsageSummary(db, c.env);

  return c.json({
    usage: summary,
  });
});

/**
 * POST /api/admin/research/run
 * Manually triggers the autonomous research and content discovery pipeline.
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
