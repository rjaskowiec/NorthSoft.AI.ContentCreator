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
import { sanitizeSecretTokens } from '../../publishing/facebook-publisher.js';

export const facebookRouter = new Hono<AppEnv>();

interface MetaPagePost {
  id: string;
  message?: string;
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
 * Fetches the latest published posts from the configured Facebook Page.
 * Returns sanitized post data without any access tokens or secrets.
 * Protected by requireAdmin middleware (inherited from parent router).
 */
facebookRouter.get('/facebook/page-posts', async (c) => {
  const pageId = (c.env.META_PAGE_ID || '').trim();
  const accessToken = (c.env.META_PAGE_ACCESS_TOKEN || '').trim();
  const apiVersion = META_API.DEFAULT_GRAPH_API_VERSION;
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

    // 3. Fetch Latest Posts from Page Feed — GET only
    const postsUrl = `${META_API.GRAPH_API_BASE_URL}/${apiVersion}/${pageId}/posts?fields=id,message,created_time,permalink_url,full_picture,is_published,type,status_type&limit=${limit}&access_token=${encodeURIComponent(accessToken)}`;

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

    // 4. Map & sanitize posts — NEVER include access tokens
    const posts = (postsData.data || []).map((post) => ({
      id: post.id,
      message: post.message || null,
      createdTime: post.created_time || null,
      permalinkUrl: post.permalink_url || null,
      fullPicture: post.full_picture || null,
      isPublished: post.is_published !== false,
      type: post.type || null,
      statusType: post.status_type || null,
    }));

    return c.json({
      configured: true,
      environment: envName,
      pageId: '***configured***',
      tokenConfigured: true,
      posts,
      postCount: posts.length,
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
