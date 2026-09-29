/**
 * Admin API — Facebook Page Posts Route Handler (READ-ONLY)
 *
 * Provides a read-only proxy to the Meta Graph API for fetching
 * the latest posts from the configured NorthSoft Facebook Page.
 *
 * SAFETY:
 * - Only authenticated GET requests are used against Meta.
 * - No POST/PUT/PATCH/DELETE to Meta.
 * - No mutations to D1 data.
 * - No Workers AI neuron consumption.
 * - Page Access Token is NEVER exposed in API responses.
 */

import { Hono } from 'hono';
import type { AppEnv } from '../../index';
import { META_API } from '../../core/constants.js';
import { getEnvironment } from '../../core/environment.js';
import { sanitizeSecretTokens, FacebookPublisher } from '../../publishing/facebook-publisher.js';
import { csrfProtection } from '../../core/auth/csrf.js';
import { D1AuditLogger } from '../../core/audit.js';
import { PublicationService } from '../../services/publishing/publication-service.js';

export const facebookRouter = new Hono<AppEnv>();

interface MetaPagePost {
  id: string;
  message?: string;
  story?: string;
  created_time?: string;
  permalink_url?: string;
  full_picture?: string;
  is_published?: boolean;
  type?: string;
  status_type?: string;
}

interface MetaPagePostsResponse {
  data?: MetaPagePost[];
  paging?: {
    cursors?: { before?: string; after?: string };
    next?: string;
  };
  error?: {
    message?: string;
    type?: string;
    code?: number;
  };
}

interface MetaPageInfoResponse {
  id?: string;
  name?: string;
  fan_count?: number;
  category?: string;
  link?: string;
  picture?: { data?: { url?: string } };
  error?: {
    message?: string;
    type?: string;
    code?: number;
  };
}

/**
 * GET /api/admin/facebook/page-posts
 *
 * Fetches the latest published posts from the configured Facebook Page using Meta Graph API v26.0.
 * Returns sanitized post data without any access tokens or secrets.
 * Protected by requireAdmin middleware (inherited from parent router).
 */
facebookRouter.get('/facebook/page-posts', async (c) => {
  const pageId = (c.env.META_PAGE_ID || '').trim();
  const accessToken = (c.env.META_PAGE_ACCESS_TOKEN || '').trim();
  const apiVersion = META_API.READ_GRAPH_API_VERSION;
  const envName = getEnvironment(c.env?.ENVIRONMENT);

  // 1. Configuration Check — both Page ID and Access Token must exist
  if (!pageId || !accessToken) {
    return c.json({
      configured: false,
      environment: envName,
      pageId: pageId ? '***configured***' : null,
      tokenConfigured: Boolean(accessToken),
      posts: [],
      pageInfo: null,
      error: 'Meta Graph API credentials not configured. Set META_PAGE_ID and META_PAGE_ACCESS_TOKEN.',
    });
  }

  const limit = Math.min(Math.max(parseInt(c.req.query('limit') || '10', 10), 1), 25);
  const after = (c.req.query('after') || '').trim();

  try {
    // 2. Fetch Page Info (name, category, picture) — GET only
    const pageInfoUrl = `${META_API.GRAPH_API_BASE_URL}/${apiVersion}/${pageId}?fields=id,name,fan_count,category,link,picture&access_token=${encodeURIComponent(accessToken)}`;

    const pageInfoRes = await fetch(pageInfoUrl, { method: 'GET' });
    const pageInfoData = (await pageInfoRes.json()) as MetaPageInfoResponse;

    let pageInfo: {
      id: string;
      name: string;
      fanCount?: number;
      category?: string;
      link?: string;
      pictureUrl?: string;
    } | null = null;

    if (pageInfoRes.ok && !pageInfoData.error) {
      pageInfo = {
        id: pageInfoData.id || pageId,
        name: pageInfoData.name || 'Facebook Page',
        fanCount: pageInfoData.fan_count,
        category: pageInfoData.category,
        link: pageInfoData.link,
        pictureUrl: pageInfoData.picture?.data?.url,
      };
    }

    // 3. Fetch Latest Posts from Page Posts endpoint — GET only
    let postsUrl = `${META_API.GRAPH_API_BASE_URL}/${apiVersion}/${pageId}/posts?fields=id,message,story,created_time,permalink_url,full_picture,is_published&limit=${limit}&access_token=${encodeURIComponent(accessToken)}`;
    if (after) {
      postsUrl += `&after=${encodeURIComponent(after)}`;
    }

    const postsRes = await fetch(postsUrl, { method: 'GET' });
    const postsData = (await postsRes.json()) as MetaPagePostsResponse;

    if (!postsRes.ok || postsData.error) {
      const rawError = postsData.error?.message || `Meta API returned HTTP ${postsRes.status}`;
      return c.json({
        configured: true,
        environment: envName,
        pageId: '***configured***',
        tokenConfigured: true,
        posts: [],
        pageInfo,
        error: sanitizeSecretTokens(rawError),
        errorCode: postsData.error?.code,
      });
    }

    // 4. Map & sanitize posts — NEVER include access tokens; fallback to story if message missing
    const posts = (postsData.data || []).map((post) => ({
      id: post.id,
      message: post.message || post.story || null,
      createdTime: post.created_time || null,
      permalinkUrl: post.permalink_url || null,
      fullPicture: post.full_picture || null,
      isPublished: post.is_published !== false,
    }));

    const hasMore = Boolean(postsData.paging?.next || postsData.paging?.cursors?.after);
    const afterCursor = postsData.paging?.cursors?.after || null;

    return c.json({
      configured: true,
      environment: envName,
      pageId: '***configured***',
      tokenConfigured: true,
      posts,
      postCount: posts.length,
      paging: {
        hasMore,
        after: afterCursor,
      },
      pageInfo,
      fetchedAt: new Date().toISOString(),
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return c.json(
      {
        configured: true,
        environment: envName,
        pageId: '***configured***',
        tokenConfigured: true,
        posts: [],
        pageInfo: null,
        error: sanitizeSecretTokens(`Failed to fetch Facebook Page posts: ${errorMsg}`),
      },
      502,
    );
  }
});

/**
 * POST /api/admin/facebook/sync
 * Triggers bidirectional Facebook -> System synchronization check for published posts.
 */
facebookRouter.post('/facebook/sync', csrfProtection, async (c) => {
  const db = c.env.DB;
  const publisher = new FacebookPublisher(c.env);
  const auditLogger = new D1AuditLogger(db);
  const pubService = new PublicationService(db, publisher, auditLogger);

  const result = await pubService.syncFacebookPostsToSystem();

  return c.json({
    success: result.errors === 0,
    result,
  });
});

/**
 * POST /api/admin/facebook/posts/:id/update
 * Pushes local updates to an already published post to Facebook via Graph API.
 */
facebookRouter.post('/facebook/posts/:id/update', csrfProtection, async (c) => {
  const db = c.env.DB;
  const id = c.req.param('id');
  if (!id) {
    return c.json({ success: false, error: 'Post ID is required.' }, 400);
  }
  const body = (await c.req.json().catch(() => ({}))) as { content?: string };

  const content = (body.content || '').trim();
  if (!content) {
    return c.json({ success: false, error: 'Content is required.' }, 400);
  }

  const publisher = new FacebookPublisher(c.env);
  const auditLogger = new D1AuditLogger(db);
  const pubService = new PublicationService(db, publisher, auditLogger);

  const result = await pubService.updatePublishedPostFromSystem(id, content, 'admin');

  if (!result.success) {
    if (result.conflict) {
      return c.json(
        {
          success: false,
          conflict: true,
          error: result.error,
          fbContent: result.fbContent,
        },
        409,
      );
    }
    return c.json({ success: false, error: result.error || 'Update failed' }, 400);
  }

  return c.json({ success: true });
});

/** Push the locally selected image to the linked published Facebook post. */
facebookRouter.post('/facebook/posts/:id/update-image', csrfProtection, async (c) => {
  const db = c.env.DB;
  const postId = c.req.param('id');
  const publication = await db.prepare(
    `SELECT id, facebook_post_id, fb_image_url FROM publications
     WHERE post_id = ? AND status = 'published' AND facebook_post_id IS NOT NULL
     ORDER BY created_at DESC LIMIT 1`,
  ).bind(postId).first<{ id: string; facebook_post_id: string; fb_image_url?: string | null }>();
  if (!publication) return c.json({ success: false, error: 'No linked Facebook publication was found.' }, 404);

  const image = await db.prepare(
    `SELECT url FROM post_images pi JOIN posts p ON p.id = pi.post_id AND p.current_version = pi.version_number WHERE pi.post_id = ? LIMIT 1`,
  ).bind(postId).first<{ url: string }>();
  const publisher = new FacebookPublisher(c.env);
  const currentFacebookPost = await publisher.getPost(publication.facebook_post_id);
  if (!currentFacebookPost.success || !currentFacebookPost.post) {
    return c.json({ success: false, error: currentFacebookPost.error || 'Could not read the current Facebook post.' }, currentFacebookPost.httpStatus === 404 ? 404 : 502);
  }

  const remoteImage = currentFacebookPost.post.fullPicture || null;
  if (publication.fb_image_url && remoteImage !== publication.fb_image_url) {
    await db.batch([
      db.prepare("UPDATE publications SET sync_status = 'CONFLICT', fb_image_url = ? WHERE id = ?").bind(remoteImage, publication.id),
      db.prepare("UPDATE posts SET sync_status = 'CONFLICT' WHERE id = ?").bind(postId),
    ]);
    return c.json({ success: false, conflict: true, error: 'The Facebook image changed since the last sync. Resolve the conflict before replacing it.' }, 409);
  }

  if (!publication.fb_image_url) {
    await db.prepare('UPDATE publications SET fb_image_url = ?, pushed_image_url = ? WHERE id = ?')
      .bind(remoteImage, image?.url || null, publication.id).run();
  }

  if (!publisher.updatePostImage) return c.json({ success: false, error: 'Image updates are not supported by this publisher.' }, 501);
  const update = await publisher.updatePostImage(publication.facebook_post_id, image?.url || null);
  if (!update.success) {
    await db.batch([
      db.prepare("UPDATE publications SET sync_status = 'LOCAL_AHEAD' WHERE id = ?").bind(publication.id),
      db.prepare("UPDATE posts SET sync_status = 'LOCAL_AHEAD' WHERE id = ?").bind(postId),
    ]);
    return c.json({ success: false, error: update.error || 'Meta rejected the image update.' }, update.httpStatus && update.httpStatus >= 400 ? update.httpStatus as 400 : 502);
  }

  const refreshed = await publisher.getPost(publication.facebook_post_id);
  if (!refreshed.success || !refreshed.post) {
    return c.json({ success: false, error: refreshed.error || 'Meta accepted the change, but the post could not be re-read to verify it.' }, 502);
  }
  const syncedAt = new Date().toISOString();
  await db.batch([
    db.prepare("UPDATE publications SET sync_status = 'SYNCED', fb_image_url = ?, pushed_image_url = ?, fb_last_check_at = ?, fb_last_sync_at = ? WHERE id = ?")
      .bind(refreshed.post.fullPicture || null, image?.url || null, syncedAt, syncedAt, publication.id),
    db.prepare("UPDATE posts SET sync_status = 'SYNCED', last_synced_at = ? WHERE id = ?").bind(syncedAt, postId),
  ]);
  return c.json({ success: true, verified: true });
});

/**
 * POST /api/admin/facebook/posts/:id/resolve-conflict
 * Resolves a sync conflict by explicitly choosing 'use_local' or 'use_facebook'.
 */
facebookRouter.post('/facebook/posts/:id/resolve-conflict', csrfProtection, async (c) => {
  const db = c.env.DB;
  const id = c.req.param('id');
  if (!id) {
    return c.json({ success: false, error: 'Post ID is required.' }, 400);
  }
  const body = (await c.req.json().catch(() => ({}))) as { resolution?: 'use_local' | 'use_facebook' };

  if (!body.resolution || (body.resolution !== 'use_local' && body.resolution !== 'use_facebook')) {
    return c.json({ success: false, error: 'resolution must be either "use_local" or "use_facebook"' }, 400);
  }

  const publisher = new FacebookPublisher(c.env);
  const auditLogger = new D1AuditLogger(db);
  const pubService = new PublicationService(db, publisher, auditLogger);

  const result = await pubService.resolveSyncConflict(id, body.resolution, 'admin');

  if (!result.success) {
    return c.json({ success: false, error: result.error || 'Failed to resolve conflict' }, 400);
  }

  return c.json({ success: true, resolution: body.resolution });
});
