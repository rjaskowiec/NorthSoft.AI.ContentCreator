import { describe, expect, it, vi } from 'vitest';
import { app } from '../../src/index';

/**
 * Creates a D1Database mock with Strict Foreign Key Constraint Enforcement.
 * Throws SQLITE_CONSTRAINT_FOREIGNKEY if parent records are deleted while child FK dependencies exist.
 */
export function createMockDbWithFkEnforcement() {
  const topicsMap = new Map<string, Record<string, unknown>>();
  const postsMap = new Map<string, Record<string, unknown>>();
  const topicHistoryMap = new Map<string, Record<string, unknown>>();
  const postVersionsMap = new Map<string, Record<string, unknown>>();
  const qualityChecksMap = new Map<string, Record<string, unknown>>();
  const schedulesMap = new Map<string, Record<string, unknown>>();
  const publicationsMap = new Map<string, Record<string, unknown>>();

  const mockSessionRow = {
    session_id: 'sess-admin-fk',
    admin_user_id: 'user-001',
    token_hash: 'token-hash',
    csrf_secret: 'csrf-secret-fk-123',
    expires_at: new Date(Date.now() + 3600000).toISOString(),
    session_created_at: new Date().toISOString(),
    last_seen_at: new Date().toISOString(),
    revoked_at: null,
    user_id: 'user-001',
    username: 'rjaskowiec',
    user_status: 'active',
  };

  const prepare = (sql: string) => {
    const normSql = sql.replace(/\s+/g, ' ').trim();
    let boundArgs: unknown[] = [];

    const stmt = {
      bind: (...args: unknown[]) => {
        boundArgs = args.map((a) => (a === undefined ? null : a));
        return stmt;
      },
      first: async <T = Record<string, unknown>>() => {
        if (normSql.includes('FROM admin_sessions')) {
          return mockSessionRow as unknown as T;
        }
        if (normSql.includes('SELECT id FROM content_ideas WHERE id =')) {
          const id = boundArgs[0] as string;
          return (topicsMap.get(id) || null) as unknown as T;
        }
        if (normSql.includes('SELECT id FROM posts WHERE id =')) {
          const id = boundArgs[0] as string;
          return (postsMap.get(id) || null) as unknown as T;
        }
        if (normSql.includes('SELECT COUNT(*) as count FROM posts WHERE idea_id')) {
          const ids = boundArgs as string[];
          let count = 0;
          for (const post of postsMap.values()) {
            if (ids.includes(post.idea_id as string)) count++;
          }
          return { count } as unknown as T;
        }
        return null as unknown as T;
      },
      all: async <T = Record<string, unknown>>() => {
        if (normSql.includes('FROM content_ideas')) {
          return { results: Array.from(topicsMap.values()) as unknown as T[] };
        }
        if (normSql.includes('FROM posts')) {
          return { results: Array.from(postsMap.values()) as unknown as T[] };
        }
        return { results: [] as T[] };
      },
      run: async () => {
        // --- TOPIC / CONTENT_IDEAS OPERATIONS ---
        if (normSql.startsWith('INSERT INTO content_ideas')) {
          const id = boundArgs[0] as string;
          topicsMap.set(id, {
            id,
            title: boundArgs[1],
            description: boundArgs[2],
            category: boundArgs[3],
            priority: boundArgs[4] || 50,
            status: boundArgs[5] || 'queued',
          });
          return { success: true };
        }

        if (normSql.includes('UPDATE posts SET idea_id = NULL')) {
          const ids = boundArgs as string[];
          for (const post of postsMap.values()) {
            if (ids.includes(post.idea_id as string)) {
              post.idea_id = null;
            }
          }
          return { success: true };
        }

        if (normSql.includes('DELETE FROM content_topic_history')) {
          const ids = boundArgs as string[];
          for (const [key, hist] of topicHistoryMap.entries()) {
            if (ids.includes(hist.idea_id as string)) topicHistoryMap.delete(key);
          }
          return { success: true };
        }

        if (normSql.includes('DELETE FROM content_ideas')) {
          const ids = boundArgs as string[];
          for (const id of ids) {
            for (const post of postsMap.values()) {
              if (post.idea_id === id) {
                throw new Error('SQLITE_CONSTRAINT_FOREIGNKEY: FOREIGN KEY constraint failed');
              }
            }
            for (const hist of topicHistoryMap.values()) {
              if (hist.idea_id === id) {
                throw new Error('SQLITE_CONSTRAINT_FOREIGNKEY: FOREIGN KEY constraint failed');
              }
            }
            topicsMap.delete(id);
          }
          return { success: true };
        }

        // --- POSTS OPERATIONS ---
        if (normSql.startsWith('INSERT INTO posts')) {
          const id = boundArgs[0] as string;
          postsMap.set(id, {
            id,
            idea_id: boundArgs[1] || null,
            title: boundArgs[2],
            status: boundArgs[3] || 'draft',
          });
          return { success: true };
        }

        if (normSql.includes('DELETE FROM publications')) {
          const ids = boundArgs as string[];
          for (const [k, p] of publicationsMap.entries()) if (ids.includes(p.post_id as string)) publicationsMap.delete(k);
          return { success: true };
        }

        if (normSql.includes('DELETE FROM schedules')) {
          const ids = boundArgs as string[];
          for (const [k, s] of schedulesMap.entries()) if (ids.includes(s.post_id as string)) schedulesMap.delete(k);
          return { success: true };
        }

        if (normSql.includes('DELETE FROM quality_checks')) {
          const ids = boundArgs as string[];
          for (const [k, q] of qualityChecksMap.entries()) if (ids.includes(q.post_id as string)) qualityChecksMap.delete(k);
          return { success: true };
        }

        if (normSql.includes('UPDATE content_topic_history SET post_id = NULL')) {
          const ids = boundArgs as string[];
          for (const hist of topicHistoryMap.values()) {
            if (ids.includes(hist.post_id as string)) hist.post_id = null;
          }
          return { success: true };
        }

        if (normSql.includes('DELETE FROM post_versions')) {
          const ids = boundArgs as string[];
          for (const [k, v] of postVersionsMap.entries()) if (ids.includes(v.post_id as string)) postVersionsMap.delete(k);
          return { success: true };
        }

        if (normSql.includes('DELETE FROM posts')) {
          const ids = boundArgs as string[];
          for (const id of ids) {
            for (const v of postVersionsMap.values()) if (v.post_id === id) throw new Error('SQLITE_CONSTRAINT_FOREIGNKEY: FOREIGN KEY constraint failed');
            for (const q of qualityChecksMap.values()) if (q.post_id === id) throw new Error('SQLITE_CONSTRAINT_FOREIGNKEY: FOREIGN KEY constraint failed');
            for (const s of schedulesMap.values()) if (s.post_id === id) throw new Error('SQLITE_CONSTRAINT_FOREIGNKEY: FOREIGN KEY constraint failed');
            for (const p of publicationsMap.values()) if (p.post_id === id) throw new Error('SQLITE_CONSTRAINT_FOREIGNKEY: FOREIGN KEY constraint failed');
            postsMap.delete(id);
          }
          return { success: true };
        }

        return { success: true };
      },
    };

    return stmt;
  };

  const batch = vi.fn(async (statements: Array<{ run?: () => Promise<unknown> }>) => {
    for (const stmt of statements) {
      if (stmt && typeof stmt.run === 'function') {
        await stmt.run();
      }
    }
    return [];
  });

  return {
    prepare,
    batch,
    topicsMap,
    postsMap,
    topicHistoryMap,
    postVersionsMap,
    qualityChecksMap,
    schedulesMap,
    publicationsMap,
  } as unknown as D1Database & {
    topicsMap: Map<string, Record<string, unknown>>;
    postsMap: Map<string, Record<string, unknown>>;
    topicHistoryMap: Map<string, Record<string, unknown>>;
    postVersionsMap: Map<string, Record<string, unknown>>;
    qualityChecksMap: Map<string, Record<string, unknown>>;
    schedulesMap: Map<string, Record<string, unknown>>;
    publicationsMap: Map<string, Record<string, unknown>>;
  };
}

const authHeaders = {
  Cookie: 'admin_session=sess-admin-fk',
  'x-csrf-token': 'csrf-secret-fk-123',
  'Content-Type': 'application/json',
};

describe('D1 Strict Foreign Key Enforcement & Atomic Deletion Integration Suite', () => {
  it('1. single topic delete with active FK dependencies (posts & topic history)', async () => {
    const mockDb = createMockDbWithFkEnforcement();
    const mockEnv = { DB: mockDb, ENVIRONMENT: 'development', FACEBOOK_PUBLISH_ENABLED: 'false' };

    const topicId = 'topic-fk-1';
    mockDb.topicsMap.set(topicId, { id: topicId, title: 'FK Topic 1', status: 'queued' });
    mockDb.postsMap.set('post-fk-1', { id: 'post-fk-1', idea_id: topicId, title: 'Child Post' });
    mockDb.topicHistoryMap.set('hist-fk-1', { id: 'hist-fk-1', idea_id: topicId, title: 'Child History' });

    const res = await app.request(`/api/admin/research/topics/${topicId}`, {
      method: 'DELETE',
      headers: authHeaders,
    }, mockEnv);

    expect(res.status).toBe(409);
    const data = (await res.json()) as { success: boolean; error: string };
    expect(data.success).toBe(false);
    expect(data.error).toContain('linked post draft(s) exist');

    // Topic and its linked post must remain intact
    expect(mockDb.topicsMap.has(topicId)).toBe(true);
    expect(mockDb.postsMap.get('post-fk-1')?.idea_id).toBe(topicId);
  });

  it('2. bulk topic delete with active FK dependencies across multiple topics', async () => {
    const mockDb = createMockDbWithFkEnforcement();
    const mockEnv = { DB: mockDb, ENVIRONMENT: 'development', FACEBOOK_PUBLISH_ENABLED: 'false' };

    mockDb.topicsMap.set('t1', { id: 't1', title: 'Topic 1' });
    mockDb.topicsMap.set('t2', { id: 't2', title: 'Topic 2' });
    mockDb.postsMap.set('p1', { id: 'p1', idea_id: 't1', title: 'Post 1' });
    mockDb.postsMap.set('p2', { id: 'p2', idea_id: 't2', title: 'Post 2' });
    mockDb.topicHistoryMap.set('h1', { id: 'h1', idea_id: 't1' });
    mockDb.topicHistoryMap.set('h2', { id: 'h2', idea_id: 't2' });

    const res = await app.request('/api/admin/research/topics/bulk-delete', {
      method: 'DELETE',
      headers: authHeaders,
      body: JSON.stringify({ ids: ['t1', 't2'] }),
    }, mockEnv);

    expect(res.status).toBe(409);
    const data = (await res.json()) as { success: boolean; error: string };
    expect(data.success).toBe(false);
    expect(data.error).toContain('linked post draft(s) exist');

    expect(mockDb.topicsMap.size).toBe(2);
    expect(mockDb.postsMap.get('p1')?.idea_id).toBe('t1');
    expect(mockDb.postsMap.get('p2')?.idea_id).toBe('t2');
  });

  it('3. single post delete with all child FK dependencies (versions, quality checks, schedules, publications)', async () => {
    const mockDb = createMockDbWithFkEnforcement();
    const mockEnv = { DB: mockDb, ENVIRONMENT: 'development', FACEBOOK_PUBLISH_ENABLED: 'false' };

    const postId = 'p-full-child-1';
    mockDb.postsMap.set(postId, { id: postId, title: 'Post to delete' });
    mockDb.postVersionsMap.set('v1', { id: 'v1', post_id: postId });
    mockDb.qualityChecksMap.set('q1', { id: 'q1', post_id: postId });
    mockDb.schedulesMap.set('s1', { id: 's1', post_id: postId });
    mockDb.publicationsMap.set('pub1', { id: 'pub1', post_id: postId });

    const res = await app.request(`/api/admin/content/posts/${postId}`, {
      method: 'DELETE',
      headers: authHeaders,
    }, mockEnv);

    expect(res.status).toBe(200);
    const data = (await res.json()) as { success: boolean };
    expect(data.success).toBe(true);

    expect(mockDb.postsMap.has(postId)).toBe(false);
    expect(mockDb.postVersionsMap.has('v1')).toBe(false);
    expect(mockDb.qualityChecksMap.has('q1')).toBe(false);
    expect(mockDb.schedulesMap.has('s1')).toBe(false);
    expect(mockDb.publicationsMap.has('pub1')).toBe(false);
  });

  it('4. bulk post delete with active child FK dependencies across multiple posts', async () => {
    const mockDb = createMockDbWithFkEnforcement();
    const mockEnv = { DB: mockDb, ENVIRONMENT: 'development', FACEBOOK_PUBLISH_ENABLED: 'false' };

    mockDb.postsMap.set('p1', { id: 'p1' });
    mockDb.postsMap.set('p2', { id: 'p2' });
    mockDb.postVersionsMap.set('v1', { id: 'v1', post_id: 'p1' });
    mockDb.postVersionsMap.set('v2', { id: 'v2', post_id: 'p2' });

    const res = await app.request('/api/admin/content/posts/bulk-delete', {
      method: 'DELETE',
      headers: authHeaders,
      body: JSON.stringify({ ids: ['p1', 'p2'] }),
    }, mockEnv);

    expect(res.status).toBe(200);
    const data = (await res.json()) as { success: boolean; count: number };
    expect(data.success).toBe(true);
    expect(data.count).toBe(2);

    expect(mockDb.postsMap.size).toBe(0);
    expect(mockDb.postVersionsMap.size).toBe(0);
  });

  it('5. handles non-existent single topic or post deletion gracefully', async () => {
    const mockDb = createMockDbWithFkEnforcement();
    const mockEnv = { DB: mockDb, ENVIRONMENT: 'development', FACEBOOK_PUBLISH_ENABLED: 'false' };

    const topicRes = await app.request('/api/admin/research/topics/nonexistent-topic-id-999', {
      method: 'DELETE',
      headers: authHeaders,
    }, mockEnv);
    expect(topicRes.status).toBe(200);

    const postRes = await app.request('/api/admin/content/posts/nonexistent-post-id-999', {
      method: 'DELETE',
      headers: authHeaders,
    }, mockEnv);
    expect(postRes.status).toBe(200);
  });

  it('6. handles empty bulk delete payloads with 400 Bad Request error response', async () => {
    const mockDb = createMockDbWithFkEnforcement();
    const mockEnv = { DB: mockDb, ENVIRONMENT: 'development', FACEBOOK_PUBLISH_ENABLED: 'false' };

    const topicRes = await app.request('/api/admin/research/topics/bulk-delete', {
      method: 'DELETE',
      headers: authHeaders,
      body: JSON.stringify({ ids: [] }),
    }, mockEnv);
    expect(topicRes.status).toBe(400);

    const postRes = await app.request('/api/admin/content/posts/bulk-delete', {
      method: 'DELETE',
      headers: authHeaders,
      body: JSON.stringify({ ids: [] }),
    }, mockEnv);
    expect(postRes.status).toBe(400);
  });

  it('7. handles invalid payload formats in bulk requests safely without uncaught 500 crashes', async () => {
    const mockDb = createMockDbWithFkEnforcement();
    const mockEnv = { DB: mockDb, ENVIRONMENT: 'development', FACEBOOK_PUBLISH_ENABLED: 'false' };

    const invalidRes = await app.request('/api/admin/research/topics/bulk-delete', {
      method: 'DELETE',
      headers: authHeaders,
      body: 'invalid json content string',
    }, mockEnv);
    expect(invalidRes.status).toBe(400);
  });

  it('8. confirms zero orphan records remain in any dependent child table after bulk deletion', async () => {
    const mockDb = createMockDbWithFkEnforcement();
    const mockEnv = { DB: mockDb, ENVIRONMENT: 'development', FACEBOOK_PUBLISH_ENABLED: 'false' };

    mockDb.topicsMap.set('t-orphan-1', { id: 't-orphan-1' });
    mockDb.postsMap.set('p-orphan-1', { id: 'p-orphan-1', idea_id: 't-orphan-1' });
    mockDb.postVersionsMap.set('v-orphan-1', { id: 'v-orphan-1', post_id: 'p-orphan-1' });
    mockDb.topicHistoryMap.set('h-orphan-1', { id: 'h-orphan-1', idea_id: 't-orphan-1', post_id: 'p-orphan-1' });

    // Correct order: Bulk delete posts first, then bulk delete topic
    const postDelRes = await app.request('/api/admin/content/posts/bulk-delete', {
      method: 'DELETE',
      headers: authHeaders,
      body: JSON.stringify({ ids: ['p-orphan-1'] }),
    }, mockEnv);
    expect(postDelRes.status).toBe(200);

    const topicDelRes = await app.request('/api/admin/research/topics/bulk-delete', {
      method: 'DELETE',
      headers: authHeaders,
      body: JSON.stringify({ ids: ['t-orphan-1'] }),
    }, mockEnv);
    expect(topicDelRes.status).toBe(200);

    expect(mockDb.topicsMap.size).toBe(0);
    expect(mockDb.postsMap.size).toBe(0);
    expect(mockDb.postVersionsMap.size).toBe(0);
    expect(mockDb.topicHistoryMap.size).toBe(0);
  });
});
