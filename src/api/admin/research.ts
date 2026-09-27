/**
 * Admin API — Research & Discovery Route Handler
 */

import { Hono } from 'hono';
import type { AppEnv } from '../../index';
import { getAIProvider } from '../../ai/factory';
import { csrfProtection } from '../../core/auth/csrf';
import { QuotaManager } from '../../services/ai/quota-manager';
import { ResearchService } from '../../services/research/research-service';
import { D1AuditLogger } from '../../core/audit';

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

/**
 * POST /api/admin/research/topics
 * Manually creates a new content topic idea in English.
 */
researchRouter.post('/research/topics', csrfProtection, async (c) => {
  const db = c.env.DB;
  const body = (await c.req.json().catch(() => ({}))) as {
    title?: string;
    description?: string;
    category?: string;
    priority?: number;
  };

  const title = (body.title || '').trim();
  if (!title) {
    return c.json({ error: 'Topic title is required.' }, 400);
  }

  const id = crypto.randomUUID();
  const description = (body.description || '').trim();
  const category = (body.category || 'WEBSITE').trim();
  const priority = typeof body.priority === 'number' ? body.priority : 50;
  const nowIso = new Date().toISOString();

  await db
    .prepare(
      `INSERT INTO content_ideas (id, title, description, category, source_type, priority, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'manual', ?, 'queued', ?, ?)`,
    )
    .bind(id, title, description, category, priority, nowIso, nowIso)
    .run();

  return c.json({ success: true, id, title });
});

/**
 * PATCH /api/admin/research/topics/bulk-status
 * Bulk updates status for multiple selected topics.
 */
researchRouter.patch('/research/topics/bulk-status', csrfProtection, async (c) => {
  const db = c.env.DB;
  const body = (await c.req.json().catch(() => ({}))) as {
    ids?: string[];
    status?: string;
  };

  const ids = Array.isArray(body.ids) ? body.ids : [];
  const status = (body.status || '').trim();

  if (ids.length === 0 || !status) {
    return c.json({ error: 'Missing required fields: ids (array) and status' }, 400);
  }

  for (const id of ids) {
    await db
      .prepare("UPDATE content_ideas SET status = ?, updated_at = datetime('now') WHERE id = ?")
      .bind(status, id)
      .run();
  }

  return c.json({ success: true, count: ids.length, status });
});

/**
 * DELETE /api/admin/research/topics/bulk-delete
 * Bulk deletes multiple selected topics.
 */
researchRouter.delete('/research/topics/bulk-delete', csrfProtection, async (c) => {
  const db = c.env.DB;
  const body = (await c.req.json().catch(() => ({}))) as {
    ids?: string[];
  };

  const ids = Array.isArray(body.ids) ? body.ids.filter((i): i is string => typeof i === 'string' && i.trim().length > 0) : [];
  if (ids.length === 0) {
    return c.json({ success: false, error: 'Missing required field: ids (non-empty array)' }, 400);
  }

  try {
    const placeholders = ids.map(() => '?').join(',');
    await db.batch([
      db.prepare(`UPDATE posts SET idea_id = NULL WHERE idea_id IN (${placeholders})`).bind(...ids),
      db.prepare(`DELETE FROM content_topic_history WHERE idea_id IN (${placeholders})`).bind(...ids),
      db.prepare(`DELETE FROM content_ideas WHERE id IN (${placeholders})`).bind(...ids),
    ]);
    return c.json({ success: true, count: ids.length });
  } catch (err: unknown) {
    const errorLogger = new D1AuditLogger(db);
    await errorLogger.log({
      eventType: 'SYSTEM_ERROR',
      entityType: 'topic',
      entityId: 'bulk',
      actor: 'admin',
      details: { action: 'bulk-delete', count: ids.length, error: err instanceof Error ? err.message : String(err) },
    }).catch(() => {});

    return c.json({ success: false, error: 'Unable to bulk delete selected topics' }, 500);
  }
});

/**
 * PATCH /api/admin/research/topics/:id
 * Updates an existing topic's fields (title, description, category, status, priority).
 */
researchRouter.patch('/research/topics/:id', csrfProtection, async (c) => {
  const db = c.env.DB;
  const id = c.req.param('id');
  const body = (await c.req.json().catch(() => ({}))) as {
    title?: string;
    description?: string;
    category?: string;
    status?: string;
    priority?: number;
  };

  const existing = await db
    .prepare('SELECT id FROM content_ideas WHERE id = ?')
    .bind(id)
    .first();

  if (!existing) {
    return c.json({ error: 'Topic not found' }, 404);
  }

  const updates: string[] = [];
  const bindings: unknown[] = [];

  if (body.title !== undefined) {
    updates.push('title = ?');
    bindings.push(body.title.trim());
  }
  if (body.description !== undefined) {
    updates.push('description = ?');
    bindings.push(body.description.trim());
  }
  if (body.category !== undefined) {
    updates.push('category = ?');
    bindings.push(body.category.trim());
  }
  if (body.status !== undefined) {
    updates.push('status = ?');
    bindings.push(body.status.trim());
  }
  if (body.priority !== undefined && typeof body.priority === 'number') {
    updates.push('priority = ?');
    bindings.push(body.priority);
  }

  if (updates.length === 0) {
    return c.json({ success: true, message: 'No fields to update' });
  }

  updates.push("updated_at = datetime('now')");
  bindings.push(id);

  const sql = `UPDATE content_ideas SET ${updates.join(', ')} WHERE id = ?`;
  await db.prepare(sql).bind(...bindings).run();

  return c.json({ success: true, id });
});

/**
 * DELETE /api/admin/research/topics/:id
 * Deletes a specific content topic.
 */
researchRouter.delete('/research/topics/:id', csrfProtection, async (c) => {
  const db = c.env.DB;
  const id = c.req.param('id');

  if (!id) {
    return c.json({ success: false, error: 'Invalid topic ID' }, 400);
  }

  try {
    await db.batch([
      db.prepare('UPDATE posts SET idea_id = NULL WHERE idea_id = ?').bind(id),
      db.prepare('DELETE FROM content_topic_history WHERE idea_id = ?').bind(id),
      db.prepare('DELETE FROM content_ideas WHERE id = ?').bind(id),
    ]);
    return c.json({ success: true, id });
  } catch (err: unknown) {
    const errorLogger = new D1AuditLogger(db);
    await errorLogger.log({
      eventType: 'SYSTEM_ERROR',
      entityType: 'topic',
      entityId: id,
      actor: 'admin',
      details: { action: 'single-delete', error: err instanceof Error ? err.message : String(err) },
    }).catch(() => {});

    return c.json({ success: false, error: 'Unable to delete selected topic' }, 500);
  }
});

