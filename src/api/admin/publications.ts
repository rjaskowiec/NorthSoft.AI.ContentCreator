/**
 * Admin API — Publications Route Handler
 */

import { Hono } from 'hono';
import type { AppEnv } from '../../index';
import { D1AuditLogger } from '../../core/audit';
import { csrfProtection } from '../../core/auth/csrf';
import { FacebookPublisher } from '../../publishing/facebook-publisher';
import { PublicationService } from '../../services/publishing/publication-service';

export const publicationsRouter = new Hono<AppEnv>();

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

  if (!result.success && result.code === 'POST_NOT_APPROVED') {
    return c.json({ error: result.message, code: result.code }, 403);
  }

  return c.json({
    success: result.success,
    result,
  });
});
