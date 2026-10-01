/**
 * Admin API — Content Route Handler
 */

import { Hono } from 'hono';
import type { AppEnv } from '../../index';
import { csrfProtection } from '../../core/auth/csrf';
import { ContentPlannerService } from '../../services/content/content-planner-service';
import { D1AuditLogger } from '../../core/audit';
import { OpenverseImageService } from '../../services/content/image-service';

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
  let result;
  try {
    result = await planner.generatePostFromTopic(body.topicId, 'admin');
  } catch (err) {
    console.error("GENERATE API ERROR:", err);
    throw err;
  }

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
  const requestedPostId = (c.req.query('postId') || '').trim();
  const postsRes = await db
    .prepare(
      `SELECT p.id, p.idea_id, p.title, p.status, p.current_version, p.quality_score, p.quality_decision, p.created_at, p.updated_at, p.sync_status,
              ci.title as topic_title, ci.source_title, ci.source_url as article_source_url, ci.category as topic_category,
              ci.content_pillar, ci.content_angle, ci.description as topic_description, ci.source_type as topic_source_type,
              v.content as latest_body, v.ai_provider, v.ai_model,
              pi.url as image_url, pi.source_url as image_source_url, pi.source_id, pi.author, pi.author_url, pi.license, pi.license_url,
              pi.alt_text, pi.verification_status, pi.visual_verification_status, pi.visual_verification_reason,
              pi.selection_source, pi.curated_image_id,
              (SELECT s.id FROM schedules s WHERE s.post_id = p.id AND s.status IN ('pending', 'publishing', 'published') ORDER BY s.scheduled_at DESC LIMIT 1) as schedule_id,
              (SELECT s.scheduled_at FROM schedules s WHERE s.post_id = p.id AND s.status IN ('pending', 'publishing', 'published') ORDER BY s.scheduled_at DESC LIMIT 1) as scheduled_at,
              (SELECT s.status FROM schedules s WHERE s.post_id = p.id AND s.status IN ('pending', 'publishing', 'published') ORDER BY s.scheduled_at DESC LIMIT 1) as schedule_status,
              (SELECT pub.facebook_post_id FROM publications pub WHERE pub.post_id = p.id AND pub.status = 'published' ORDER BY pub.created_at DESC LIMIT 1) as facebook_post_id,
              (SELECT pub.published_at FROM publications pub WHERE pub.post_id = p.id AND pub.status = 'published' ORDER BY pub.created_at DESC LIMIT 1) as published_at
       FROM posts p
       LEFT JOIN content_ideas ci ON ci.id = p.idea_id
       LEFT JOIN post_versions v ON p.id = v.post_id AND p.current_version = v.version_number
       LEFT JOIN post_images pi ON pi.post_id = p.id AND pi.version_number = p.current_version
       WHERE (? = '' OR p.id = ?)
         AND (p.quality_decision IS NULL OR p.quality_decision != 'IMPORTED')
         AND (v.ai_provider IS NULL OR v.ai_provider != 'facebook')
       ORDER BY p.created_at DESC
       LIMIT 50`,
    )
    .bind(requestedPostId, requestedPostId)
    .all().catch((err) => {
      console.error("POSTS API SQL ERROR:", err);
      throw err;
    });

  return c.json({
    posts: postsRes.results || [],
  });
});

/** Search and assign an image for an existing post using hierarchical fallback. */
contentRouter.post('/content/posts/:id/image/search', csrfProtection, async (c) => {
  const postId = c.req.param('id');
  const row = await c.env.DB.prepare(
    `SELECT p.title, p.current_version, pv.content, ci.category FROM posts p
     JOIN post_versions pv ON pv.post_id = p.id AND pv.version_number = p.current_version
     LEFT JOIN content_ideas ci ON ci.id = p.idea_id WHERE p.id = ?`,
  ).bind(postId).first<{ title: string; current_version: number; content: string; category?: string | null }>();
  if (!row) return c.json({ success: false, error: 'Post not found.' }, 404);

  const imageService = new OpenverseImageService(c.env);
  const recentlyUsedRows = await c.env.DB.prepare('SELECT url FROM post_images ORDER BY created_at DESC LIMIT 50').all<{ url: string }>();
  const recentlyUsedUrls = new Set((recentlyUsedRows.results || []).map((r) => r.url));

  try {
    const found = await imageService.findBestImage(
      row.title,
      row.category || 'Technology & Business',
      row.content,
      recentlyUsedUrls,
    );

    if (!found) {
      return c.json({ success: false, error: 'No legal image passed category/semantic search hierarchy. Add one by URL or upload a file.' }, 422);
    }

    const candidate = found.candidate;
    const now = new Date().toISOString();
    const confidence = Number((Math.min(1.0, found.score / 100)).toFixed(2));

    await c.env.DB.batch([
      c.env.DB.prepare('DELETE FROM post_images WHERE post_id = ? AND version_number = ?').bind(postId, row.current_version),
      c.env.DB.prepare(
        `INSERT INTO post_images (id, post_id, version_number, url, alt_text, source_url, source_id, author, author_url,
          license, license_url, verified_at, verification_status, visual_verification_status, visual_verification_reason,
          visual_verification_confidence, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'verified', 'accept', ?, ?, ?)`,
      ).bind(
        crypto.randomUUID(), postId, row.current_version, candidate.url, candidate.title || 'Selected Illustration', candidate.sourceUrl,
        candidate.id, candidate.author, candidate.authorUrl || null, candidate.license, candidate.licenseUrl,
        now, found.reason, confidence, now,
      ),
    ]);

    return c.json({
      success: true,
      imageUrl: candidate.url,
      author: candidate.author,
      license: candidate.license,
      matchLevel: found.level,
      score: found.score,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[ContentImageSearch] Image search failed:', message);
    return c.json({ success: false, error: 'Image search failed. Check Worker logs for details.' }, 502);
  }
});

/** Add or replace the current version's primary image using an HTTPS URL or a file upload. */
contentRouter.post('/content/posts/:id/image', csrfProtection, async (c) => {
  const db = c.env.DB;
  const postId = c.req.param('id');
  const post = await db.prepare('SELECT current_version FROM posts WHERE id = ?').bind(postId).first<{ current_version: number }>();
  if (!post) return c.json({ success: false, error: 'Post not found.' }, 404);
  if (!c.env.IMAGE_BUCKET) return c.json({ success: false, error: 'Image storage is not configured.' }, 503);

  let bytes: ArrayBuffer;
  let contentType: string;
  const provenance: { sourceUrl: string | null; author: string | null; license: string | null; licenseUrl: string | null } = {
    sourceUrl: null, author: null, license: null, licenseUrl: null,
  };

  try {
    if ((c.req.header('content-type') || '').includes('multipart/form-data')) {
      const form = await c.req.formData();
      const file = form.get('file');
      if (!(file instanceof File)) return c.json({ success: false, error: 'Choose an image file.' }, 400);
      if (file.size < 1 || file.size > 10 * 1024 * 1024) return c.json({ success: false, error: 'Image must be smaller than 10 MB.' }, 413);
      bytes = await file.arrayBuffer();
    } else {
      const body = await c.req.json().catch(() => ({})) as { url?: string };
      const sourceUrl = (body.url || '').trim();
      if (!sourceUrl) return c.json({ success: false, error: 'Image URL is required.' }, 400);
      const parsed = new URL(sourceUrl);
      if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
        return c.json({ success: false, error: 'Use a public HTTPS image URL.' }, 400);
      }
      bytes = await new OpenverseImageService(c.env).downloadImage(sourceUrl);
      provenance.sourceUrl = sourceUrl;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Image could not be read.';
    return c.json({ success: false, error: message }, 400);
  }

  const data = new Uint8Array(bytes);
  if (data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) contentType = 'image/jpeg';
  else if (data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47) contentType = 'image/png';
  else if (data[0] === 0x52 && data[1] === 0x49 && data[2] === 0x46 && data[3] === 0x46 && data[8] === 0x57 && data[9] === 0x45 && data[10] === 0x42 && data[11] === 0x50) contentType = 'image/webp';
  else return c.json({ success: false, error: 'Only valid JPEG, PNG, and WebP images are supported.' }, 400);

  const ext = contentType === 'image/jpeg' ? 'jpg' : contentType === 'image/png' ? 'png' : 'webp';
  const key = `${crypto.randomUUID()}.${ext}`;
  const now = new Date().toISOString();
  await c.env.IMAGE_BUCKET.put(`images/${key}`, bytes, {
    httpMetadata: { contentType, cacheControl: 'public, max-age=31536000, immutable' },
  });
  const imageUrl = `${new URL(c.req.url).origin}/media/${key}`;
  await db.batch([
    db.prepare('DELETE FROM post_images WHERE post_id = ? AND version_number = ?').bind(postId, post.current_version),
    db.prepare(`INSERT INTO post_images (id, post_id, version_number, url, alt_text, source_url, author, license, license_url, verification_status, visual_verification_status, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'manual', 'not_checked', ?)`).bind(
      crypto.randomUUID(), postId, post.current_version, imageUrl, 'Post image', provenance.sourceUrl,
      provenance.author, provenance.license, provenance.licenseUrl, now,
    ),
  ]);
  const publication = await db.prepare("SELECT id FROM publications WHERE post_id = ? AND status = 'published' ORDER BY created_at DESC LIMIT 1")
    .bind(postId).first<{ id: string }>();
  if (publication) {
    await db.batch([
      db.prepare("UPDATE publications SET sync_status = 'LOCAL_AHEAD' WHERE id = ?").bind(publication.id),
      db.prepare("UPDATE posts SET sync_status = 'LOCAL_AHEAD' WHERE id = ?").bind(postId),
    ]);
  }
  return c.json({ success: true, imageUrl, message: 'Image saved.' });
});

/** Remove the current version's primary image and release reservation. */
contentRouter.delete('/content/posts/:id/image', csrfProtection, async (c) => {
  const postId = c.req.param('id') || '';
  const post = await c.env.DB.prepare('SELECT current_version FROM posts WHERE id = ?').bind(postId).first<{ current_version: number }>();
  if (!post) return c.json({ success: false, error: 'Post not found.' }, 404);

  const { ImageLibraryService } = await import('../../services/content/image-library-service');
  const imgLib = new ImageLibraryService(c.env.DB);
  await imgLib.releaseDraftReservation(postId);

  await c.env.DB.prepare('DELETE FROM post_images WHERE post_id = ? AND version_number = ?').bind(postId, post.current_version).run();
  const publication = await c.env.DB.prepare("SELECT id FROM publications WHERE post_id = ? AND status = 'published' ORDER BY created_at DESC LIMIT 1")
    .bind(postId).first<{ id: string }>();
  if (publication) {
    await c.env.DB.batch([
      c.env.DB.prepare("UPDATE publications SET sync_status = 'LOCAL_AHEAD' WHERE id = ?").bind(publication.id),
      c.env.DB.prepare("UPDATE posts SET sync_status = 'LOCAL_AHEAD' WHERE id = ?").bind(postId),
    ]);
  }
  return c.json({ success: true, message: 'Image removed from the current local version.' });
});

/**
 * GET /api/admin/content/posts/:id/image-library
 * Returns APPROVED images suitable for assignment to a draft post.
 */
contentRouter.get('/content/posts/:id/image-library', async (c) => {
  const postId = c.req.param('id') || '';
  const search = (c.req.query('search') || '').trim();
  const category = (c.req.query('category') || '').trim();
  const limit = parseInt(c.req.query('limit') || '24', 10);
  const offset = parseInt(c.req.query('offset') || '0', 10);

  const { ImageLibraryService } = await import('../../services/content/image-library-service');
  const imgLib = new ImageLibraryService(c.env.DB);

  const result = await imgLib.listImages({
    status: 'APPROVED',
    category,
    search,
    limit,
    offset,
  });

  return c.json({
    success: true,
    postId,
    images: result.images,
    total: result.total,
  });
});

/**
 * POST /api/admin/content/posts/:id/assign-image
 * Manually assigns or removes an approved library image for a post draft.
 */
contentRouter.post('/content/posts/:id/assign-image', csrfProtection, async (c) => {
  const postId = c.req.param('id') || '';
  const body = (await c.req.json().catch(() => ({}))) as { imageId?: string; action?: 'assign' | 'remove' };

  const post = await c.env.DB.prepare('SELECT id FROM posts WHERE id = ?').bind(postId).first();
  if (!post) return c.json({ success: false, error: 'Post draft not found.' }, 404);

  const { ImageLibraryService } = await import('../../services/content/image-library-service');
  const imgLib = new ImageLibraryService(c.env.DB);

  if (body.action === 'remove' || !body.imageId) {
    await imgLib.releaseDraftReservation(postId);
    await c.env.DB.prepare('DELETE FROM post_images WHERE post_id = ?').bind(postId).run();
    return c.json({ success: true, message: 'Illustration removed from draft.' });
  }

  try {
    await imgLib.reserveImageForDraft(body.imageId, postId, true);
    return c.json({
      success: true,
      imageId: body.imageId,
      message: 'Approved illustration assigned to draft post.',
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return c.json({ success: false, error: errorMsg }, 400);
  }
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
 * Creates a post manually without AI generation. Always creates manual content_idea record.
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

  const nowIso = new Date().toISOString();
  const ideaId = crypto.randomUUID();

  // Always create manual content_idea row so provenance is retained
  await db
    .prepare(
      `INSERT INTO content_ideas (id, title, description, category, source_type, priority, status, created_at, updated_at)
       VALUES (?, ?, ?, 'SMALL_BUSINESS', 'manual', 50, 'used', ?, ?)`,
    )
    .bind(ideaId, topicTitle || title, content.slice(0, 150), nowIso, nowIso)
    .run();

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
    const { ImageLibraryService } = await import('../../services/content/image-library-service');
    const imgLib = new ImageLibraryService(db);
    for (const id of ids) {
      await imgLib.releaseDraftReservation(id).catch(() => {});
    }

    const placeholders = ids.map(() => '?').join(',');
    await db.batch([
      db.prepare(`DELETE FROM publications WHERE post_id IN (${placeholders})`).bind(...ids),
      db.prepare(`DELETE FROM schedules WHERE post_id IN (${placeholders})`).bind(...ids),
      db.prepare(`DELETE FROM quality_checks WHERE post_id IN (${placeholders})`).bind(...ids),
      db.prepare(`DELETE FROM post_sources WHERE post_id IN (${placeholders})`).bind(...ids),
      db.prepare(`UPDATE content_topic_history SET post_id = NULL WHERE post_id IN (${placeholders})`).bind(...ids),
      db.prepare(`DELETE FROM post_images WHERE post_id IN (${placeholders})`).bind(...ids),
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
    await db.batch([
      db.prepare('UPDATE post_versions SET content = ? WHERE post_id = ? AND version_number = ?')
        .bind(newBody, id, currentVer),
      db.prepare("UPDATE posts SET sync_status = 'LOCAL_AHEAD' WHERE id = ?")
        .bind(id)
    ]);
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
    const { ImageLibraryService } = await import('../../services/content/image-library-service');
    const imgLib = new ImageLibraryService(db);
    await imgLib.releaseDraftReservation(id).catch(() => {});

    await db.batch([
      db.prepare('DELETE FROM publications WHERE post_id = ?').bind(id),
      db.prepare('DELETE FROM schedules WHERE post_id = ?').bind(id),
      db.prepare('DELETE FROM quality_checks WHERE post_id = ?').bind(id),
      db.prepare('DELETE FROM post_sources WHERE post_id = ?').bind(id),
      db.prepare('UPDATE content_topic_history SET post_id = NULL WHERE post_id = ?').bind(id),
      db.prepare('DELETE FROM post_images WHERE post_id = ?').bind(id),
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

    // Reset topic status back to post_generated if unscheduled
    const postRow = await db.prepare('SELECT idea_id FROM posts WHERE id = ?').bind(sched.post_id).first<{ idea_id: string }>();
    if (postRow && postRow.idea_id) {
      await db.prepare("UPDATE content_ideas SET status = 'post_generated', updated_at = datetime('now') WHERE id = ?").bind(postRow.idea_id).run();
    }
  }

  return c.json({ success: true, id });
});

/**
 * POST /api/admin/content/schedules/intelligent-preview
 * Previews intelligent scheduling proposals for selected candidate draft post IDs.
 */
contentRouter.post('/content/schedules/intelligent-preview', csrfProtection, async (c) => {
  const db = c.env.DB;
  const body = (await c.req.json().catch(() => ({}))) as { postIds?: string[] };
  const postIds = Array.isArray(body.postIds) ? body.postIds.filter((i): i is string => typeof i === 'string' && i.trim().length > 0) : [];

  if (postIds.length === 0) {
    return c.json({ success: false, error: 'postIds array is required' }, 400);
  }

  const { IntelligentSchedulingService } = await import('../../services/publishing/intelligent-scheduler-service');
  const scheduler = new IntelligentSchedulingService();
  const proposedSlots = await scheduler.proposeIntelligentSchedules(db, postIds);

  return c.json({
    success: true,
    proposedSlots,
  });
});

/**
 * POST /api/admin/content/schedules/intelligent-commit
 * Commits approved intelligent scheduling slots to D1, updating post and topic status to scheduled.
 */
contentRouter.post('/content/schedules/intelligent-commit', csrfProtection, async (c) => {
  const db = c.env.DB;
  const body = (await c.req.json().catch(() => ({}))) as {
    slots?: Array<{
      postId: string;
      scheduledAtIso: string;
      decisionMetadata?: any;
    }>;
  };

  const slots = Array.isArray(body.slots) ? body.slots : [];
  if (slots.length === 0) {
    return c.json({ success: false, error: 'slots array is required' }, 400);
  }

  const nowIso = new Date().toISOString();
  let committedCount = 0;

  for (const slot of slots) {
    const postId = (slot.postId || '').trim();
    const scheduledAt = (slot.scheduledAtIso || '').trim();
    if (!postId || !scheduledAt) continue;

    const metadataJson = slot.decisionMetadata ? JSON.stringify(slot.decisionMetadata) : null;
    const existingSched = await db.prepare('SELECT id FROM schedules WHERE post_id = ?').bind(postId).first();

    if (existingSched) {
      await db
        .prepare('UPDATE schedules SET scheduled_at = ?, status = "pending", decision_metadata = ?, updated_at = ? WHERE post_id = ?')
        .bind(scheduledAt, metadataJson, nowIso, postId)
        .run();
    } else {
      await db
        .prepare(
          `INSERT INTO schedules (id, post_id, scheduled_at, timezone, status, decision_metadata, created_at, updated_at)
           VALUES (?, ?, ?, 'UTC', 'pending', ?, ?, ?)`,
        )
        .bind(crypto.randomUUID(), postId, scheduledAt, metadataJson, nowIso, nowIso)
        .run();
    }

    // Update post status to scheduled
    await db.prepare('UPDATE posts SET status = "scheduled", updated_at = ? WHERE id = ?').bind(nowIso, postId).run();

    // Update linked topic status to scheduled
    const postRow = await db.prepare('SELECT idea_id FROM posts WHERE id = ?').bind(postId).first<{ idea_id: string }>();
    if (postRow && postRow.idea_id) {
      await db.prepare("UPDATE content_ideas SET status = 'scheduled', updated_at = datetime('now') WHERE id = ?").bind(postRow.idea_id).run();
    }

    committedCount++;
  }

  return c.json({
    success: true,
    committedCount,
  });
});
