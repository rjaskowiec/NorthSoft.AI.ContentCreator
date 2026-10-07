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
                cluster_key, market_phenomenon, customer_opportunity,
                source_title, source_url, relevance_score, engagement_potential, commercial_relevance, suggested_publish_date, priority, status, created_at,
                (SELECT COUNT(*) FROM posts p WHERE p.idea_id = content_ideas.id) AS post_count,
                (SELECT p.id FROM posts p WHERE p.idea_id = content_ideas.id ORDER BY p.created_at DESC LIMIT 1) AS latest_post_id,
                (SELECT CASE
                  WHEN EXISTS (SELECT 1 FROM publications pub WHERE pub.post_id = p.id AND pub.status = 'published' AND pub.fb_deleted_at IS NULL) THEN 'published'
                  WHEN EXISTS (SELECT 1 FROM schedules s WHERE s.post_id = p.id AND s.status IN ('pending', 'publishing') AND datetime(s.scheduled_at) > datetime('now')) THEN 'scheduled'
                  ELSE p.status
                END FROM posts p WHERE p.idea_id = content_ideas.id ORDER BY p.created_at DESC LIMIT 1) AS latest_post_status,
                (SELECT pi.visual_verification_status FROM posts p JOIN post_images pi ON pi.post_id = p.id AND pi.version_number = p.current_version WHERE p.idea_id = content_ideas.id ORDER BY p.created_at DESC LIMIT 1) AS latest_image_status,
                (SELECT s.scheduled_at FROM posts p JOIN schedules s ON s.post_id = p.id AND s.status IN ('pending', 'publishing') AND datetime(s.scheduled_at) > datetime('now') WHERE p.idea_id = content_ideas.id ORDER BY s.scheduled_at ASC LIMIT 1) AS latest_scheduled_at,
                (SELECT pub.published_at FROM posts p JOIN publications pub ON pub.post_id = p.id AND pub.status = 'published' AND pub.fb_deleted_at IS NULL WHERE p.idea_id = content_ideas.id ORDER BY pub.published_at DESC LIMIT 1) AS latest_published_at
         FROM content_ideas
         ORDER BY created_at DESC LIMIT 100`,
      )
      .all<Record<string, unknown>>();
    topics = topicsRes.results || [];
  } catch {
    const topicsRes = await db
      .prepare(
        "SELECT id, title, description, category, priority, status, created_at, 0 AS post_count FROM content_ideas WHERE source_type = 'research' ORDER BY created_at DESC LIMIT 100",
      )
      .all<Record<string, unknown>>();
    topics = topicsRes.results || [];
  }

  const requestedTopicId = (c.req.query('topicId') || '').trim();
  if (requestedTopicId && !topics.some((topic) => topic.id === requestedTopicId)) {
    const requestedTopic = await db
      .prepare(
        `SELECT id, title, description, short_description, content_angle, hook, category, content_pillar,
              cluster_key, market_phenomenon, customer_opportunity,
              source_title, source_url, relevance_score, engagement_potential, commercial_relevance, suggested_publish_date, priority, status, created_at,
              (SELECT COUNT(*) FROM posts p WHERE p.idea_id = content_ideas.id) AS post_count,
              (SELECT p.id FROM posts p WHERE p.idea_id = content_ideas.id ORDER BY p.created_at DESC LIMIT 1) AS latest_post_id,
              (SELECT CASE
                WHEN EXISTS (SELECT 1 FROM publications pub WHERE pub.post_id = p.id AND pub.status = 'published' AND pub.fb_deleted_at IS NULL) THEN 'published'
                WHEN EXISTS (SELECT 1 FROM schedules s WHERE s.post_id = p.id AND s.status IN ('pending', 'publishing') AND datetime(s.scheduled_at) > datetime('now')) THEN 'scheduled'
                ELSE p.status
              END FROM posts p WHERE p.idea_id = content_ideas.id ORDER BY p.created_at DESC LIMIT 1) AS latest_post_status,
              (SELECT pi.visual_verification_status FROM posts p JOIN post_images pi ON pi.post_id = p.id AND pi.version_number = p.current_version WHERE p.idea_id = content_ideas.id ORDER BY p.created_at DESC LIMIT 1) AS latest_image_status,
              (SELECT s.scheduled_at FROM posts p JOIN schedules s ON s.post_id = p.id AND s.status IN ('pending', 'publishing') AND datetime(s.scheduled_at) > datetime('now') WHERE p.idea_id = content_ideas.id ORDER BY s.scheduled_at ASC LIMIT 1) AS latest_scheduled_at,
              (SELECT pub.published_at FROM posts p JOIN publications pub ON pub.post_id = p.id AND pub.status = 'published' AND pub.fb_deleted_at IS NULL WHERE p.idea_id = content_ideas.id ORDER BY pub.published_at DESC LIMIT 1) AS latest_published_at
       FROM content_ideas WHERE id = ?`,
      )
      .bind(requestedTopicId)
      .first<Record<string, unknown>>();
    if (requestedTopic) topics.push(requestedTopic);
  }

  // Dynamic status computation: ground truth reconciliation
  topics = topics.map((topic) => {
    const postCount = Number(topic.post_count || 0);
    const rawStatus = String(topic.status || 'queued').toLowerCase();
    const hasLivePub = Boolean(topic.latest_published_at);
    const hasActiveSched = Boolean(topic.latest_scheduled_at);

    if (hasLivePub) {
      return { ...topic, status: 'published' };
    }
    if (hasActiveSched) {
      return { ...topic, status: 'scheduled' };
    }
    if (
      postCount === 0 &&
      ['post_generated', 'used', 'scheduled', 'published'].includes(rawStatus)
    ) {
      return {
        ...topic,
        status: 'queued',
        latest_post_id: null,
        latest_post_status: null,
        latest_image_status: null,
        latest_scheduled_at: null,
        latest_published_at: null,
      };
    }
    return topic;
  });

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

  const queuedCount = topics.filter(
    (t) => t.status === 'queued' || t.status === 'new' || t.status === 'discovered',
  ).length;

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

  const description = (body.description || '').trim();
  let title = (body.title || '').trim();
  if (!title) {
    if (!description) {
      return c.json({ error: 'Post idea or description is required.' }, 400);
    }
    title = description.length > 80 ? description.slice(0, 77) + '...' : description;
  }

  const id = crypto.randomUUID();
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

  const ids = Array.isArray(body.ids)
    ? body.ids.filter((i): i is string => typeof i === 'string' && i.trim().length > 0)
    : [];
  if (ids.length === 0) {
    return c.json({ success: false, error: 'Missing required field: ids (non-empty array)' }, 400);
  }

  const placeholders = ids.map(() => '?').join(',');
  let linkedCount = 0;
  try {
    const stmt = db.prepare(`SELECT COUNT(*) as count FROM posts WHERE idea_id IN (${placeholders})`);
    const bound = stmt && typeof stmt.bind === 'function' ? stmt.bind(...ids) : null;
    if (bound && typeof bound.first === 'function') {
      const res = await bound.first<{ count: number }>();
      linkedCount = Number(res?.count || 0);
    }
  } catch {
    linkedCount = 0;
  }

  if (linkedCount > 0) {
    return c.json(
      {
        success: false,
        error: `Cannot delete selected topics: ${linkedCount} linked post draft(s) exist. Topics linked to posts are preserved to protect post metadata.`,
      },
      409,
    );
  }

  try {

    await db.batch([
      db
        .prepare(`DELETE FROM content_topic_history WHERE idea_id IN (${placeholders})`)
        .bind(...ids),
      db.prepare(`DELETE FROM content_ideas WHERE id IN (${placeholders})`).bind(...ids),
    ]);
    return c.json({ success: true, count: ids.length });
  } catch (err: unknown) {
    const errorLogger = new D1AuditLogger(db);
    await errorLogger
      .log({
        eventType: 'SYSTEM_ERROR',
        entityType: 'topic',
        entityId: 'bulk',
        actor: 'admin',
        details: {
          action: 'bulk-delete',
          count: ids.length,
          error: err instanceof Error ? err.message : String(err),
        },
      })
      .catch(() => {});

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

  const existing = await db.prepare('SELECT id FROM content_ideas WHERE id = ?').bind(id).first();

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
  await db
    .prepare(sql)
    .bind(...bindings)
    .run();

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

    let linkedCount = 0;
    try {
      const stmt = db.prepare('SELECT COUNT(*) as count FROM posts WHERE idea_id = ?');
      const bound = stmt && typeof stmt.bind === 'function' ? stmt.bind(id) : null;
      if (bound && typeof bound.first === 'function') {
        const res = await bound.first<{ count: number }>();
        linkedCount = Number(res?.count || 0);
      }
    } catch {
      linkedCount = 0;
    }

    if (linkedCount > 0) {
      return c.json(
        {
          success: false,
          error: `Cannot delete topic: ${linkedCount} linked post draft(s) exist. Topics linked to posts are preserved to protect post metadata.`,
        },
        409,
      );
    }

    try {
      await db.batch([
        db.prepare('DELETE FROM content_topic_history WHERE idea_id = ?').bind(id),
        db.prepare('DELETE FROM content_ideas WHERE id = ?').bind(id),
      ]);
      return c.json({ success: true, id });
    } catch (err: unknown) {
    console.error('DELETE /research/topics/:id ERROR:', err);
    const errorLogger = new D1AuditLogger(db);
    await errorLogger
      .log({
        eventType: 'SYSTEM_ERROR',
        entityType: 'topic',
        entityId: id,
        actor: 'admin',
        details: {
          action: 'single-delete',
          error: err instanceof Error ? err.message : String(err),
        },
      })
      .catch(() => {});

    return c.json({ success: false, error: 'Unable to delete selected topic' }, 500);
  }
});
