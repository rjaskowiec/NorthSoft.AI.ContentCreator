import { describe, expect, it, vi } from 'vitest';
import { app } from '../../src/index';

function createMockDb() {
  const topicsMap = new Map<string, Record<string, unknown>>();
  const postsMap = new Map<string, Record<string, unknown>>();

  const mockSessionRow = {
    session_id: 'sess-admin-1',
    admin_user_id: 'user-001',
    token_hash: 'token-hash',
    csrf_secret: 'csrf-secret-123',
    expires_at: new Date(Date.now() + 3600000).toISOString(),
    session_created_at: new Date().toISOString(),
    last_seen_at: new Date().toISOString(),
    revoked_at: null,
    user_id: 'user-001',
    username: 'rjaskowiec',
    user_status: 'active',
  };

  const prepare = vi.fn((sql: string) => {
    const normSql = sql.replace(/\s+/g, ' ').trim();

    if (normSql.includes('FROM admin_sessions')) {
      return {
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue(mockSessionRow),
        }),
      };
    }

    if (normSql.startsWith('INSERT INTO content_ideas')) {
      return {
        bind: vi.fn((...args: unknown[]) => ({
          run: vi.fn().mockImplementation(async () => {
            const id = args[0] as string;
            topicsMap.set(id, {
              id,
              title: args[1],
              description: args[2],
              category: args[3],
              priority: args[4],
              status: 'queued',
            });
            return { success: true };
          }),
        })),
      };
    }

    if (normSql.startsWith('UPDATE content_ideas SET title =')) {
      return {
        bind: vi.fn((...args: unknown[]) => ({
          run: vi.fn().mockImplementation(async () => {
            const id = args[args.length - 1] as string;
            const existing = topicsMap.get(id);
            if (existing) {
              existing.title = args[0];
              existing.priority = args[1];
            }
            return { success: true };
          }),
        })),
      };
    }

    if (normSql.startsWith('UPDATE content_ideas SET status =')) {
      return {
        bind: vi.fn((...args: unknown[]) => ({
          run: vi.fn().mockImplementation(async () => {
            const status = args[0] as string;
            const id = args[1] as string;
            const existing = topicsMap.get(id);
            if (existing) existing.status = status;
            return { success: true };
          }),
        })),
      };
    }

    if (normSql.includes('DELETE FROM content_ideas')) {
      return {
        bind: vi.fn((...args: unknown[]) => ({
          run: vi.fn().mockImplementation(async () => {
            for (const arg of args) {
              if (typeof arg === 'string') topicsMap.delete(arg);
            }
            return { success: true };
          }),
        })),
      };
    }

    if (normSql.includes('SELECT id FROM content_ideas WHERE id =')) {
      return {
        bind: vi.fn((...args: unknown[]) => ({
          first: vi.fn().mockImplementation(async () => {
            const id = args[0] as string;
            return topicsMap.get(id) || null;
          }),
        })),
      };
    }

    if (normSql.includes('FROM content_ideas')) {
      return {
        all: vi.fn().mockImplementation(async () => ({
          results: Array.from(topicsMap.values()),
        })),
      };
    }

    // Posts SQL handlers
    if (normSql.startsWith('INSERT INTO posts')) {
      return {
        bind: vi.fn((...args: unknown[]) => ({
          run: vi.fn().mockImplementation(async () => {
            const id = args[0] as string;
            postsMap.set(id, {
              id,
              idea_id: args[1],
              title: args[2],
              status: args[3],
            });
            return { success: true };
          }),
        })),
      };
    }

    if (normSql.startsWith('INSERT INTO post_versions')) {
      return {
        bind: vi.fn().mockReturnValue({
          run: vi.fn().mockResolvedValue({ success: true }),
        }),
      };
    }

    if (normSql.startsWith('UPDATE posts SET title =') || normSql.startsWith('UPDATE posts SET status =')) {
      return {
        bind: vi.fn((...args: unknown[]) => ({
          run: vi.fn().mockImplementation(async () => {
            const id = args[args.length - 1] as string;
            const existing = postsMap.get(id);
            if (existing && typeof args[0] === 'string') {
              existing.title = args[0];
            }
            return { success: true };
          }),
        })),
      };
    }

    if (normSql.includes('DELETE FROM posts')) {
      return {
        bind: vi.fn((...args: unknown[]) => ({
          run: vi.fn().mockImplementation(async () => {
            for (const arg of args) {
              if (typeof arg === 'string') postsMap.delete(arg);
            }
            return { success: true };
          }),
        })),
      };
    }

    if (normSql.includes('SELECT id, current_version FROM posts WHERE id =')) {
      return {
        bind: vi.fn((...args: unknown[]) => ({
          first: vi.fn().mockImplementation(async () => {
            const id = args[0] as string;
            return postsMap.get(id) || null;
          }),
        })),
      };
    }

    if (normSql.includes('FROM posts')) {
      return {
        all: vi.fn().mockImplementation(async () => ({
          results: Array.from(postsMap.values()),
        })),
      };
    }

    return {
      bind: vi.fn().mockReturnValue({
        first: vi.fn().mockResolvedValue(null),
        all: vi.fn().mockResolvedValue({ results: [] }),
        run: vi.fn().mockResolvedValue({ success: true }),
      }),
      all: vi.fn().mockResolvedValue({ results: [] }),
      first: vi.fn().mockResolvedValue(null),
    };
  });

  const batch = vi.fn(async (statements: Array<{ run?: () => Promise<unknown> }>) => {
    for (const stmt of statements) {
      if (stmt && typeof stmt.run === 'function') {
        await stmt.run();
      }
    }
    return [];
  });

  return { prepare, batch } as unknown as D1Database;
}

const authHeaders = {
  Cookie: 'admin_session=valid-admin-token-xyz',
  'x-csrf-token': 'csrf-secret-123',
  'Content-Type': 'application/json',
};

describe('Topics and Posts CRUD & Delete Operations Integration Tests', () => {
  it('performs full Topic CRUD cycle: create, edit, single delete, bulk status, bulk delete', async () => {
    const mockEnv = {
      DB: createMockDb(),
      ENVIRONMENT: 'staging',
      FACEBOOK_PUBLISH_ENABLED: 'false',
    };

    // 1. Create Topic A & Topic B
    const createResA = await app.request('/api/admin/research/topics', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        title: 'Topic A for Deletion Test',
        description: 'Test description A',
        category: 'WEBSITE',
        priority: 70,
      }),
    }, mockEnv);
    expect(createResA.status).toBe(200);
    const dataA = (await createResA.json()) as { id: string };
    expect(dataA.id).toBeDefined();
    const topicIdA = dataA.id;

    const createResB = await app.request('/api/admin/research/topics', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        title: 'Topic B for Bulk Delete Test',
        description: 'Test description B',
        category: 'MARKETING',
        priority: 60,
      }),
    }, mockEnv);
    const dataB = (await createResB.json()) as { id: string };
    const topicIdB = dataB.id;

    // 2. Edit Topic A
    const editResA = await app.request(`/api/admin/research/topics/${topicIdA}`, {
      method: 'PATCH',
      headers: authHeaders,
      body: JSON.stringify({
        title: 'Topic A Updated Title',
        priority: 90,
      }),
    }, mockEnv);
    expect(editResA.status).toBe(200);

    // 3. Delete Single Topic A
    const deleteSingleRes = await app.request(`/api/admin/research/topics/${topicIdA}`, {
      method: 'DELETE',
      headers: authHeaders,
    }, mockEnv);
    expect(deleteSingleRes.status).toBe(200);
    const deleteSingleData = (await deleteSingleRes.json()) as { success: boolean; id: string };
    expect(deleteSingleData.success).toBe(true);
    expect(deleteSingleData.id).toBe(topicIdA);

    // Verify Topic A is gone from research topics list
    const getRes1 = await app.request('/api/admin/research', { headers: authHeaders }, mockEnv);
    const getRes1Data = (await getRes1.json()) as { topics: Array<{ id: string }> };
    expect(getRes1Data.topics.some((t) => t.id === topicIdA)).toBe(false);

    // 4. Bulk Status Update for Topic B
    const bulkStatusRes = await app.request('/api/admin/research/topics/bulk-status', {
      method: 'PATCH',
      headers: authHeaders,
      body: JSON.stringify({
        ids: [topicIdB],
        status: 'accepted',
      }),
    }, mockEnv);
    expect(bulkStatusRes.status).toBe(200);

    // 5. Bulk Delete Topic B
    const bulkDeleteRes = await app.request('/api/admin/research/topics/bulk-delete', {
      method: 'DELETE',
      headers: authHeaders,
      body: JSON.stringify({
        ids: [topicIdB],
      }),
    }, mockEnv);
    expect(bulkDeleteRes.status).toBe(200);
    const bulkDeleteData = (await bulkDeleteRes.json()) as { success: boolean; count: number };
    expect(bulkDeleteData.success).toBe(true);
    expect(bulkDeleteData.count).toBe(1);

    // Verify Topic B is gone from research list
    const getRes2 = await app.request('/api/admin/research', { headers: authHeaders }, mockEnv);
    const getRes2Data = (await getRes2.json()) as { topics: Array<{ id: string }> };
    expect(getRes2Data.topics.some((t) => t.id === topicIdB)).toBe(false);
  });

  it('handles empty bulk topic delete and nonexistent topic delete gracefully', async () => {
    const mockEnv = {
      DB: createMockDb(),
      ENVIRONMENT: 'staging',
      FACEBOOK_PUBLISH_ENABLED: 'false',
    };

    // Empty bulk selection returns 400
    const emptyBulkRes = await app.request('/api/admin/research/topics/bulk-delete', {
      method: 'DELETE',
      headers: authHeaders,
      body: JSON.stringify({ ids: [] }),
    }, mockEnv);
    expect(emptyBulkRes.status).toBe(400);

    // Deleting nonexistent single topic returns 200 success
    const nonexistentRes = await app.request('/api/admin/research/topics/nonexistent-id-999', {
      method: 'DELETE',
      headers: authHeaders,
    }, mockEnv);
    expect(nonexistentRes.status).toBe(200);
  });

  it('performs full Post Draft CRUD cycle: create, edit, single delete, bulk status, bulk delete', async () => {
    const mockEnv = {
      DB: createMockDb(),
      ENVIRONMENT: 'staging',
      FACEBOOK_PUBLISH_ENABLED: 'false',
    };

    // 1. Create Post Draft A & Post Draft B
    const createPostResA = await app.request('/api/admin/content/manual-post', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        topicTitle: 'Post A Topic',
        content: 'Content body for post draft A testing deletion',
        status: 'draft',
      }),
    }, mockEnv);
    expect(createPostResA.status).toBe(200);
    const postDataA = (await createPostResA.json()) as { postId: string };
    const postIdA = postDataA.postId;

    const createPostResB = await app.request('/api/admin/content/manual-post', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        topicTitle: 'Post B Topic',
        content: 'Content body for post draft B testing bulk deletion',
        status: 'draft',
      }),
    }, mockEnv);
    const postDataB = (await createPostResB.json()) as { postId: string };
    const postIdB = postDataB.postId;

    // 2. Edit Post A
    const editPostResA = await app.request(`/api/admin/content/posts/${postIdA}`, {
      method: 'PATCH',
      headers: authHeaders,
      body: JSON.stringify({
        title: 'Post A Updated Title',
        body: 'Updated body content for post A',
      }),
    }, mockEnv);
    expect(editPostResA.status).toBe(200);

    // 3. Delete Single Post A
    const deleteSinglePostRes = await app.request(`/api/admin/content/posts/${postIdA}`, {
      method: 'DELETE',
      headers: authHeaders,
    }, mockEnv);
    expect(deleteSinglePostRes.status).toBe(200);

    // Verify Post A is gone from content posts list
    const getPostsRes1 = await app.request('/api/admin/content/posts', { headers: authHeaders }, mockEnv);
    const getPostsData1 = (await getPostsRes1.json()) as { posts: Array<{ id: string }> };
    expect(getPostsData1.posts.some((p) => p.id === postIdA)).toBe(false);

    // 4. Bulk Status Update for Post B
    const bulkStatusPostRes = await app.request('/api/admin/content/posts/bulk-status', {
      method: 'PATCH',
      headers: authHeaders,
      body: JSON.stringify({
        ids: [postIdB],
        status: 'approved',
      }),
    }, mockEnv);
    expect(bulkStatusPostRes.status).toBe(200);

    // 5. Bulk Delete Post B
    const bulkDeletePostRes = await app.request('/api/admin/content/posts/bulk-delete', {
      method: 'DELETE',
      headers: authHeaders,
      body: JSON.stringify({
        ids: [postIdB],
      }),
    }, mockEnv);
    expect(bulkDeletePostRes.status).toBe(200);

    // Verify Post B is gone from content posts list
    const getPostsRes2 = await app.request('/api/admin/content/posts', { headers: authHeaders }, mockEnv);
    const getPostsData2 = (await getPostsRes2.json()) as { posts: Array<{ id: string }> };
    expect(getPostsData2.posts.some((p) => p.id === postIdB)).toBe(false);
  });
});
