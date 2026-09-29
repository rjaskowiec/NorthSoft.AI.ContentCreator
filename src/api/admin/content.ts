/**
 * Admin API — Content Route Handler
 */

import { Hono } from 'hono';
import type { AppEnv } from '../../index';
import { csrfProtection } from '../../core/auth/csrf';
import { ContentPlannerService } from '../../services/content/content-planner-service';
import { D1AuditLogger } from '../../core/audit';

export const contentRouter = new Hono<AppEnv>();

/**
 * POST /api/admin/content/generate
 * Manually triggers the autonomous Writer + QA + Policy pipeline for a candidate topic.
 * Protected by requireAdmin and csrfProtection.
 */
contentRouter.post('/content/generate', csrfProtection, async (c) => {
  const db = c.env.DB;
  const body = (await c.req.json().catch(() => ({}))) as { topicId?: string };

  if (!body.topicId || typeof body.topicId !== 'string') {
    return c.json({ success: false, error: 'Missing required string field: topicId' }, 400);
  }

  const planner = new ContentPlannerService(db, c.env);
  const result = await planner.generatePostFromTopic(body.topicId, 'admin');

  if ((result.status === 'failed' || result.status === 'deferred') && !result.postId) {
    return c.json(
      {
        success: false,
        error: {
          code: result.status === 'deferred' ? 'AI_QUOTA_DEFERRED' : 'AI_GENERATION_FAILED',
          message: result.errorMessage || 'Post generation failed. Please try again.',
          retryable: true,
        },
        result,
      },
      422,
    );
  }

  const isSuccess = result.status === 'approved' || (!!result.postId && result.status !== 'failed');

  return c.json({
    success: isSuccess,
    result,
  });
});

/**
 * GET /api/admin/content/posts
 * Returns recent generated posts, versions, QA scores, and quality decisions.
 */
contentRouter.get('/content/posts', async (c) => {
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
 * POST /api/admin/content/manual-topic-post
 * Generates a post from a manually entered topic title and optional description context.
 */
contentRouter.post('/content/manual-topic-post', csrfProtection, async (c) => {
  const db = c.env.DB;
  const body = (await c.req.json().catch(() => ({}))) as {
    title?: string;
    description?: string;
    category?: string;
  };

  const title = (body.title || '').trim();
  if (!title) {
    return c.json({ error: 'Topic title is required.' }, 400);
  }

  const topicId = crypto.randomUUID();
  const description = (body.description || '').trim();
  const category = (body.category || 'WEBSITE').trim();
  const nowIso = new Date().toISOString();

  // 1. Store topic in content_ideas
  await db
    .prepare(
      `INSERT INTO content_ideas (id, title, description, category, source_type, priority, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'manual', 80, 'queued', ?, ?)`,
    )
    .bind(topicId, title, description, category, nowIso, nowIso)
    .run();

  // 2. Generate post using ContentPlannerService
  const planner = new ContentPlannerService(db, c.env);
  const result = await planner.generatePostFromTopic(topicId, 'admin');

  return c.json({
    success: result.status === 'approved',
    topicId,
    result,
  });
});

/**
 * POST /api/admin/content/manual-post
 * Creates a post manually without AI generation.
 */
contentRouter.post('/content/manual-post', csrfProtection, async (c) => {
  const db = c.env.DB;
  const body = (await c.req.json().catch(() => ({}))) as {
    topicTitle?: string;
    content?: string;
    status?: string;
  };

  const content = (body.content || '').trim();
  if (!content) {
    return c.json({ error: 'Post content is required.' }, 400);
  }

  const topicTitle = (body.topicTitle || '').trim();
  const title = topicTitle || (content.length > 50 ? content.slice(0, 47) + '...' : content);
  const status = (body.status || 'draft').trim();

  let ideaId: string | null = null;
  const nowIso = new Date().toISOString();

  if (topicTitle) {
    ideaId = crypto.randomUUID();
    await db
      .prepare(
        `INSERT INTO content_ideas (id, title, description, category, source_type, priority, status, created_at, updated_at)
         VALUES (?, ?, ?, 'SMALL_BUSINESS', 'manual', 50, 'used', ?, ?)`,
      )
      .bind(ideaId, topicTitle, content.slice(0, 150), nowIso, nowIso)
      .run();
  }

  const postId = crypto.randomUUID();
  const versionId = crypto.randomUUID();

  await db
    .prepare(
      `INSERT INTO posts (id, idea_id, title, status, current_version, quality_score, quality_decision, created_at, updated_at)
       VALUES (?, ?, ?, ?, 1, 100, 'PASS', ?, ?)`,
    )
    .bind(postId, ideaId, title, status, nowIso, nowIso)
    .run();

  await db
    .prepare(
      `INSERT INTO post_versions (id, post_id, version_number, content, content_type, metadata, ai_model, ai_provider, created_at)
       VALUES (?, ?, 1, ?, 'text', ?, 'manual-admin', 'admin', ?)`,
    )
    .bind(versionId, postId, content, JSON.stringify({ manual: true, actor: 'admin' }), nowIso)
    .run();

  return c.json({ success: true, postId, title, status });
});

/**
 * PATCH /api/admin/content/posts/bulk-status
 * Bulk updates status for multiple post drafts.
 */
contentRouter.patch('/content/posts/bulk-status', csrfProtection, async (c) => {
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

  const nowIso = new Date().toISOString();
  for (const id of ids) {
    await db
      .prepare('UPDATE posts SET status = ?, updated_at = ? WHERE id = ?')
      .bind(status, nowIso, id)
      .run();
  }

  return c.json({ success: true, count: ids.length, status });
});

/**
 * DELETE /api/admin/content/posts/bulk-delete
 * Bulk deletes multiple post drafts.
 */
contentRouter.delete('/content/posts/bulk-delete', csrfProtection, async (c) => {
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
      db.prepare(`DELETE FROM publications WHERE post_id IN (${placeholders})`).bind(...ids),
      db.prepare(`DELETE FROM schedules WHERE post_id IN (${placeholders})`).bind(...ids),
      db.prepare(`DELETE FROM quality_checks WHERE post_id IN (${placeholders})`).bind(...ids),
      db.prepare(`DELETE FROM post_sources WHERE post_id IN (${placeholders})`).bind(...ids),
      db.prepare(`UPDATE content_topic_history SET post_id = NULL WHERE post_id IN (${placeholders})`).bind(...ids),
      db.prepare(`DELETE FROM post_versions WHERE post_id IN (${placeholders})`).bind(...ids),
      db.prepare(`DELETE FROM posts WHERE id IN (${placeholders})`).bind(...ids),
    ]);
    return c.json({ success: true, count: ids.length });
  } catch (err: unknown) {
    const errorLogger = new D1AuditLogger(db);
    await errorLogger.log({
      eventType: 'SYSTEM_ERROR',
      entityType: 'post',
      entityId: 'bulk',
      actor: 'admin',
      details: { action: 'bulk-delete', count: ids.length, error: err instanceof Error ? err.message : String(err) },
    }).catch(() => {});

    return c.json({ success: false, error: 'Unable to bulk delete selected post drafts' }, 500);
  }
});

/**
 * PATCH /api/admin/content/posts/:id
 * Updates an existing post's title, body content, or status.
 */
contentRouter.patch('/content/posts/:id', csrfProtection, async (c) => {
  const db = c.env.DB;
  const id = c.req.param('id');
  const body = (await c.req.json().catch(() => ({}))) as {
    title?: string;
    body?: string;
    status?: string;
  };

  const postRow = await db
    .prepare('SELECT id, current_version FROM posts WHERE id = ?')
    .bind(id)
    .first<{ id: string; current_version: number }>();

  if (!postRow) {
    return c.json({ error: 'Post draft not found' }, 404);
  }

  const nowIso = new Date().toISOString();

  if (body.title !== undefined || body.status !== undefined) {
    const updates: string[] = ["updated_at = ?"];
    const bindings: unknown[] = [nowIso];

    if (body.title !== undefined) {
      updates.push("title = ?");
      bindings.push(body.title.trim());
    }
    if (body.status !== undefined) {
      updates.push("status = ?");
      bindings.push(body.status.trim());
    }

    bindings.push(id);
    await db.prepare(`UPDATE posts SET ${updates.join(', ')} WHERE id = ?`).bind(...bindings).run();
  }

  if (body.body !== undefined) {
    const newBody = body.body.trim();
    const currentVer = postRow.current_version || 1;
    await db
      .prepare('UPDATE post_versions SET content = ? WHERE post_id = ? AND version_number = ?')
      .bind(newBody, id, currentVer)
      .run();
  }

  return c.json({ success: true, id });
});

/**
 * DELETE /api/admin/content/posts/:id
 * Deletes a post draft and its associated version history and schedule.
 */
contentRouter.delete('/content/posts/:id', csrfProtection, async (c) => {
  const db = c.env.DB;
  const id = c.req.param('id');

  if (!id) {
    return c.json({ success: false, error: 'Invalid post ID' }, 400);
  }

  try {
    await db.batch([
      db.prepare('DELETE FROM publications WHERE post_id = ?').bind(id),
      db.prepare('DELETE FROM schedules WHERE post_id = ?').bind(id),
      db.prepare('DELETE FROM quality_checks WHERE post_id = ?').bind(id),
      db.prepare('DELETE FROM post_sources WHERE post_id = ?').bind(id),
      db.prepare('UPDATE content_topic_history SET post_id = NULL WHERE post_id = ?').bind(id),
      db.prepare('DELETE FROM post_versions WHERE post_id = ?').bind(id),
      db.prepare('DELETE FROM posts WHERE id = ?').bind(id),
    ]);
    return c.json({ success: true, id });
  } catch (err: unknown) {
    const errorLogger = new D1AuditLogger(db);
    await errorLogger.log({
      eventType: 'SYSTEM_ERROR',
      entityType: 'post',
      entityId: id,
      actor: 'admin',
      details: { action: 'single-delete', error: err instanceof Error ? err.message : String(err) },
    }).catch(() => {});

    return c.json({ success: false, error: 'Unable to delete selected post draft' }, 500);
  }
});

/**
 * POST /api/admin/content/posts/:id/schedule
 * Schedules a post draft for future publication.
 */
contentRouter.post('/content/posts/:id/schedule', csrfProtection, async (c) => {
  const db = c.env.DB;
  const id = c.req.param('id');
  const body = (await c.req.json().catch(() => ({}))) as {
    scheduledAt?: string;
  };

  const scheduledAt = (body.scheduledAt || '').trim();
  if (!scheduledAt) {
    return c.json({ success: false, error: 'scheduledAt ISO date-time is required.' }, 400);
  }

  const scheduledMs = new Date(scheduledAt).getTime();
  if (isNaN(scheduledMs) || scheduledMs < Date.now()) {
    return c.json({ success: false, error: 'A post cannot be scheduled in the past.' }, 400);
  }

  const scheduleId = crypto.randomUUID();
  const nowIso = new Date().toISOString();

  // Upsert schedule
  const existingSched = await db
    .prepare('SELECT id FROM schedules WHERE post_id = ?')
    .bind(id)
    .first();

  if (existingSched) {
    await db
      .prepare('UPDATE schedules SET scheduled_at = ?, status = "pending", updated_at = ? WHERE post_id = ?')
      .bind(scheduledAt, nowIso, id)
      .run();
  } else {
    await db
      .prepare(
        `INSERT INTO schedules (id, post_id, scheduled_at, timezone, status, created_at, updated_at)
         VALUES (?, ?, ?, 'UTC', 'pending', ?, ?)`,
      )
      .bind(scheduleId, id, scheduledAt, nowIso, nowIso)
      .run();
  }

  await db
    .prepare('UPDATE posts SET status = "scheduled", updated_at = ? WHERE id = ?')
    .bind(nowIso, id)
    .run();

  return c.json({ success: true, postId: id, scheduledAt });
});

/**
 * DELETE /api/admin/content/schedules/:id
 * Unschedules a post, deleting the schedule row and resetting post status to approved/draft.
 */
contentRouter.delete('/content/schedules/:id', csrfProtection, async (c) => {
  const db = c.env.DB;
  const id = c.req.param('id');
  const nowIso = new Date().toISOString();

  const sched = await db
    .prepare('SELECT post_id FROM schedules WHERE id = ? OR post_id = ?')
    .bind(id, id)
    .first<{ post_id: string }>();

  if (sched && sched.post_id) {
    await db.prepare('DELETE FROM schedules WHERE id = ? OR post_id = ?').bind(id, id).run();
    await db
      .prepare('UPDATE posts SET status = "approved", updated_at = ? WHERE id = ? AND status = "scheduled"')
      .bind(nowIso, sched.post_id)
      .run();
  }

  return c.json({ success: true, id });
});
