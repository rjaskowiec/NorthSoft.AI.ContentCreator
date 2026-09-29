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
  updated_time?: string;
  is_published?: boolean;
  is_hidden?: boolean;
  shares?: { count?: number };
  comments?: { summary?: { total_count?: number } };
  reactions?: { summary?: { total_count?: number } };
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

  const limit = Math.min(Math.max(parseInt(c.req.query('limit') || '5', 10), 1), 25);
  const after = (c.req.query('after') || '').trim();
  const includeStats = c.req.query('includeStats') === 'true';

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
    const fields = 'id,message,story,created_time,updated_time,permalink_url,full_picture,is_published,is_hidden,shares,comments.limit(0).summary(true),reactions.limit(0).summary(true)';
    let postsUrl = `${META_API.GRAPH_API_BASE_URL}/${apiVersion}/${pageId}/published_posts?fields=${encodeURIComponent(fields)}&limit=${limit}&access_token=${encodeURIComponent(accessToken)}`;
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
    const facebookPostIds = (postsData.data || []).map((post) => post.id);
    const localPostIds = new Map<string, string>();
    if (facebookPostIds.length > 0) {
      const placeholders = facebookPostIds.map(() => '?').join(',');
      const linkedPosts = await c.env.DB.prepare(
        `SELECT facebook_post_id, post_id FROM publications WHERE facebook_post_id IN (${placeholders}) AND fb_deleted_at IS NULL`,
      ).bind(...facebookPostIds).all<{ facebook_post_id: string; post_id: string }>();
      for (const linked of linkedPosts.results || []) localPostIds.set(linked.facebook_post_id, linked.post_id);
    }

    const posts = await Promise.all((postsData.data || []).map(async (post) => {
      let views: number | null = null;
      let uniqueViews: number | null = null;
      let insightsError: string | null = null;
      if (includeStats) {
        try {
          const metrics = 'post_media_view,post_total_media_view_unique';
          const insightsUrl = `${META_API.GRAPH_API_BASE_URL}/${apiVersion}/${encodeURIComponent(post.id)}/insights?metric=${metrics}&period=lifetime&access_token=${encodeURIComponent(accessToken)}`;
          const insightsResponse = await fetch(insightsUrl, { method: 'GET' });
          const insightsData = (await insightsResponse.json()) as {
            data?: Array<{ name?: string; values?: Array<{ value?: number }> }>;
            error?: { message?: string };
          };
          if (!insightsResponse.ok || insightsData.error) {
            insightsError = sanitizeSecretTokens(insightsData.error?.message || `Insights unavailable (HTTP ${insightsResponse.status})`);
          } else {
            for (const metric of insightsData.data || []) {
              const value = Number(metric.values?.[0]?.value);
              if (!Number.isFinite(value)) continue;
              if (metric.name === 'post_media_view') views = value;
              if (metric.name === 'post_total_media_view_unique') uniqueViews = value;
            }
          }
        } catch (error: unknown) {
          insightsError = sanitizeSecretTokens(error instanceof Error ? error.message : String(error));
        }
      }
      return {
      id: post.id,
      internalPostId: localPostIds.get(post.id) || null,
      message: post.message || post.story || null,
      createdTime: post.created_time || null,
      updatedTime: post.updated_time || null,
      permalinkUrl: post.permalink_url || null,
      fullPicture: post.full_picture || null,
      isPublished: post.is_published !== false,
      isHidden: post.is_hidden === true,
      comments: post.comments?.summary?.total_count ?? null,
      reactions: post.reactions?.summary?.total_count ?? null,
      shares: post.shares?.count ?? 0,
      views,
      uniqueViews,
      insightsError,
      };
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

/** Update the text of a Facebook post using the existing conflict-aware two-way sync. */
facebookRouter.post('/facebook/page-posts/:facebookPostId/update', csrfProtection, async (c) => {
  const facebookPostId = c.req.param('facebookPostId');
  const body = await c.req.json().catch(() => ({})) as { content?: string };
  const content = (body.content || '').trim();
  if (!content) return c.json({ success: false, error: 'Post content is required.' }, 400);

  const db = c.env.DB;
  const publisher = new FacebookPublisher(c.env);
  const auditLogger = new D1AuditLogger(db);
  const pubService = new PublicationService(db, publisher, auditLogger);
  let publication = await db.prepare("SELECT post_id FROM publications WHERE facebook_post_id = ? AND status = 'published' LIMIT 1")
    .bind(facebookPostId).first<{ post_id: string }>();
  if (!publication) {
    await pubService.syncFacebookPostsToSystem();
    publication = await db.prepare("SELECT post_id FROM publications WHERE facebook_post_id = ? AND status = 'published' LIMIT 1")
      .bind(facebookPostId).first<{ post_id: string }>();
  }
  if (!publication) return c.json({ success: false, error: 'This Facebook post could not be synchronized to the local publication history.' }, 404);

  const result = await pubService.updatePublishedPostFromSystem(publication.post_id, content, 'admin');
  if (!result.success) return c.json({ success: false, conflict: result.conflict === true, error: result.error, facebookContent: result.fbContent }, result.conflict ? 409 : 400);
  return c.json({ success: true });
});

/** Hide or unhide a Facebook post and record the resulting remote state locally. */
facebookRouter.post('/facebook/page-posts/:facebookPostId/visibility', csrfProtection, async (c) => {
  const facebookPostId = c.req.param('facebookPostId');
  if (!facebookPostId) return c.json({ success: false, error: 'Facebook post ID is required.' }, 400);
  const body = await c.req.json().catch(() => ({})) as { hidden?: boolean };
  if (typeof body.hidden !== 'boolean') return c.json({ success: false, error: 'hidden must be a boolean.' }, 400);

  const publisher = new FacebookPublisher(c.env);
  if (!publisher.updatePostHidden) return c.json({ success: false, error: 'Facebook post visibility changes are not supported.' }, 501);
  const result = await publisher.updatePostHidden(facebookPostId, body.hidden);
  if (!result.success) return c.json({ success: false, error: result.error || 'Meta rejected the visibility change.' }, result.httpStatus && result.httpStatus >= 400 ? result.httpStatus as 400 : 502);

  await c.env.DB.prepare('UPDATE publications SET fb_is_hidden = ?, fb_last_check_at = ?, fb_last_sync_at = ? WHERE facebook_post_id = ?')
    .bind(body.hidden ? 1 : 0, new Date().toISOString(), new Date().toISOString(), facebookPostId).run();
  return c.json({ success: true, hidden: body.hidden });
});

/** Delete a post from Facebook while retaining its local audit/history record. */
facebookRouter.delete('/facebook/page-posts/:facebookPostId', csrfProtection, async (c) => {
  const facebookPostId = c.req.param('facebookPostId');
  if (!facebookPostId) return c.json({ success: false, error: 'Facebook post ID is required.' }, 400);
  const publisher = new FacebookPublisher(c.env);
  if (!publisher.deletePost) return c.json({ success: false, error: 'Facebook post deletion is not supported.' }, 501);
  const result = await publisher.deletePost(facebookPostId);
  if (!result.success) return c.json({ success: false, error: result.error || 'Meta rejected the delete request.' }, result.httpStatus && result.httpStatus >= 400 ? result.httpStatus as 400 : 502);

  const deletedAt = new Date().toISOString();
  await c.env.DB.prepare("UPDATE publications SET fb_deleted_at = ?, sync_status = 'SYNCED', fb_last_check_at = ?, fb_last_sync_at = ? WHERE facebook_post_id = ?")
    .bind(deletedAt, deletedAt, deletedAt, facebookPostId).run();
  return c.json({ success: true, deletedAt });
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
