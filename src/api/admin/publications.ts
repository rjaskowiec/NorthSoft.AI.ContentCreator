/**
 * Admin API — Publications Route Handler
 */

import { Hono } from 'hono';
import type { AppEnv } from '../../index';
import { D1AuditLogger } from '../../core/audit';
import { csrfProtection } from '../../core/auth/csrf';
import { FacebookPublisher } from '../../publishing/facebook-publisher';
import { PublicationService } from '../../services/publishing/publication-service';

import { getEnvironment } from '../../core/environment';

export const publicationsRouter = new Hono<AppEnv>();

/**
 * GET /api/admin/meta/status
 * Returns safe diagnostic configuration status for Meta Graph API.
 * Protected by requireAdmin. Never exposes tokens or secrets.
 */
publicationsRouter.get('/meta/status', async (c) => {
  const publisher = new FacebookPublisher(c.env);
  const config = publisher.getConfigStatus();
  const envName = getEnvironment(c.env?.ENVIRONMENT);

  return c.json({
    status: config.state,
    environment: envName,
    pageConfigured: config.pageIdConfigured,
    accessTokenConfigured: config.tokenConfigured,
    publishingEnabled: config.publishEnabled,
    graphApiVersion: config.apiVersion,
    statusMessage: config.statusMessage,
  });
});

/**
 * GET /api/admin/publications
 * Returns recent publication attempts, 4-tier status, and operational health metrics.
 */
publicationsRouter.get('/publications', async (c) => {
  const db = c.env.DB;
  const publisher = new FacebookPublisher(c.env);
  const pubService = new PublicationService(db, publisher);

  const publications = await pubService.getPublications(50, 0);
  const health = await pubService.getPublicationHealth();

  return c.json({
    publications,
    configStatus: health.configStatus,
    health,
  });
});

/**
 * GET /api/admin/publications/:id
 * Returns detailed publication record including post preview, version details, and error diagnostics.
 */
publicationsRouter.get('/publications/:id', async (c) => {
  const db = c.env.DB;
  const id = c.req.param('id') || '';
  const publisher = new FacebookPublisher(c.env);
  const pubService = new PublicationService(db, publisher);

  const publication = await pubService.getPublicationById(id);
  if (!publication) {
    return c.json({ error: 'Publication record not found' }, 404);
  }

  return c.json({
    publication,
    configStatus: publisher.getConfigStatus(),
  });
});

/**
 * POST /api/admin/publications/:id/publish
 * Manually triggers publication for an approved post.
 * Protected by requireAdmin and csrfProtection.
 */
publicationsRouter.post('/publications/:id/publish', csrfProtection, async (c) => {
  const db = c.env.DB;
  const id = c.req.param('id') || '';
  const auditLogger = new D1AuditLogger(db);
  const publisher = new FacebookPublisher(c.env);
  const pubService = new PublicationService(db, publisher, auditLogger);

  // Read post_id from publications or check if id is a post_id
  let postId = id;
  const existingPub = await pubService.getPublicationById(id);
  if (existingPub) {
    postId = existingPub.postId;
  }

  const result = await pubService.publishPost(postId, { actor: 'admin' });

  if (!result.success && result.code === 'POST_NOT_APPROVED') {
    return c.json({ error: result.message, code: result.code }, 403);
  }

  return c.json({
    success: result.success,
    result,
  });
});

/**
 * POST /api/admin/publications/:id/retry
 * Manually retries a failed publication attempt.
 * Protected by requireAdmin and csrfProtection.
 */
publicationsRouter.post('/publications/:id/retry', csrfProtection, async (c) => {
  const db = c.env.DB;
  const id = c.req.param('id') || '';
  const auditLogger = new D1AuditLogger(db);
  const publisher = new FacebookPublisher(c.env);
  const pubService = new PublicationService(db, publisher, auditLogger);

  const publication = await pubService.getPublicationById(id);
  if (!publication) {
    return c.json({ error: 'Publication record not found' }, 404);
  }

  const result = await pubService.publishPost(publication.postId, { actor: 'admin' });

  return c.json({
    success: result.success,
    result,
  });
});

/**
 * POST /api/admin/publications/manual
 * Creates a manual post version (MANUAL_ADMIN_APPROVED) and executes immediate publication
 * through the existing PublicationService & MetaPublisher pipeline.
 * Zero Workers AI neurons consumed.
 * Protected by requireAdmin and csrfProtection.
 */
publicationsRouter.post('/publications/manual', csrfProtection, async (c) => {
  try {
    const db = c.env.DB;
    const auditLogger = new D1AuditLogger(db);
    const publisher = new FacebookPublisher(c.env);
    const pubService = new PublicationService(db, publisher, auditLogger);

    const configStatus = publisher.getConfigStatus();
    if (configStatus.state === 'NOT_CONFIGURED') {
      return c.json(
        {
          success: false,
          error: configStatus.statusMessage,
          code: 'META_NOT_CONFIGURED',
        },
        400,
      );
    }

    if (configStatus.state === 'DISABLED') {
      return c.json(
        {
          success: false,
          error: configStatus.statusMessage,
          code: 'META_PUBLISH_DISABLED',
        },
        403,
      );
    }

    let body: { content?: string; link?: string };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ success: false, error: 'Invalid JSON payload in request body.' }, 400);
    }

    const content = (body.content || '').trim();
    const link = (body.link || '').trim();

    // 1. Static Content Validation
    if (!content) {
      return c.json({ success: false, error: 'Post content cannot be empty.' }, 400);
    }

    if (content.length > 63206) {
      return c.json(
        {
          success: false,
          error: `Post content length (${content.length} characters) exceeds Meta Graph API maximum allowed limit of 63,206 characters.`,
        },
        400,
      );
    }

    if (link && !/^https?:\/\//i.test(link)) {
      return c.json(
        {
          success: false,
          error: 'Invalid link URL. Must start with http:// or https://',
        },
        400,
      );
    }

    // 2. Create Post & PostVersion in D1 with MANUAL_ADMIN_APPROVED status
    const postId = crypto.randomUUID();
    const versionId = crypto.randomUUID();
    const nowIso = new Date().toISOString();
    const title = content.length > 50 ? content.slice(0, 47) + '...' : content;

    // Insert post
    await db
      .prepare(
        `INSERT INTO posts (id, idea_id, title, status, current_version, quality_score, quality_decision, created_at, updated_at)
         VALUES (?, NULL, ?, 'approved', 1, 100, 'PASS', ?, ?)`,
      )
      .bind(postId, title, nowIso, nowIso)
      .run();

    // Insert post_version
    await db
      .prepare(
        `INSERT INTO post_versions (id, post_id, version_number, content, content_type, metadata, ai_model, ai_provider, created_at)
         VALUES (?, ?, 1, ?, ?, ?, 'manual-admin', 'admin', ?)`,
      )
      .bind(
        versionId,
        postId,
        content,
        link ? 'link' : 'text',
        JSON.stringify({
          manual: true,
          actor: 'admin',
          quality_gate: 'MANUAL_ADMIN_APPROVED',
          link: link || null,
        }),
        nowIso,
      )
      .run();

    await auditLogger.log({
      eventType: 'POST_APPROVED',
      entityType: 'post',
      entityId: postId,
      actor: 'admin',
      details: {
        reason: 'MANUAL_ADMIN_APPROVED',
        versionId,
        contentLength: content.length,
        hasLink: Boolean(link),
      },
    });

    // 3. Execute Publication via Existing PublicationService Flow
    const pubResult = await pubService.publishPost(postId, { actor: 'admin' });

    if (!pubResult.success) {
      return c.json(
        {
          success: false,
          error: pubResult.message || 'Publication failed via Meta Graph API.',
          code: pubResult.code || 'PUBLISH_FAILED',
          result: pubResult,
        },
        400,
      );
    }

    return c.json({
      success: true,
      publicationId: pubResult.publicationId,
      externalPostId: pubResult.externalPostId,
      publishedAt: pubResult.publishedAt,
      result: pubResult,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return c.json(
      {
        success: false,
        error: `Internal server error during manual publication: ${errorMsg}`,
        code: 'INTERNAL_SERVER_ERROR',
      },
      500,
    );
  }
});
