/**
 * Admin API — Content Route Handler
 */

import { Hono } from 'hono';
import type { AppEnv } from '../../index';
import { csrfProtection } from '../../core/auth/csrf';
import { ContentPlannerService } from '../../services/content/content-planner-service';

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
