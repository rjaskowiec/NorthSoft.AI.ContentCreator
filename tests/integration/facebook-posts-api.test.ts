import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from '../../src/index';

describe('Facebook Page Posts READ API Integration', () => {
  const mockStmt = (data: { first?: unknown; all?: unknown; run?: unknown }) => {
    const stmt = {
      first: vi.fn().mockResolvedValue(data.first ?? null),
      all: vi.fn().mockResolvedValue(data.all ?? { results: [] }),
      run: vi.fn().mockResolvedValue(data.run ?? { meta: { changes: 1 } }),
      bind: vi.fn(),
    };
    stmt.bind.mockReturnValue(stmt);
    return stmt;
  };

  const mockSessionRow = {
    session_id: 'valid_test_session_id',
    admin_user_id: 'usr_admin',
    token_hash: 'token_hash',
    csrf_secret: 'csrf_secret_key_123',
    expires_at: new Date(Date.now() + 3600000).toISOString(),
    session_created_at: new Date().toISOString(),
    last_seen_at: new Date().toISOString(),
    revoked_at: null,
    ip_address: '127.0.0.1',
    user_agent: 'Vitest',
    user_id: 'usr_admin',
    username: 'admin',
    user_status: 'active',
    user_created_at: new Date().toISOString(),
    user_updated_at: new Date().toISOString(),
    last_login_at: new Date().toISOString(),
  };

  const mockEnv = {
    DB: {
      prepare: vi.fn((sql: string) => {
        if (sql.includes('admin_sessions')) {
          return mockStmt({ first: mockSessionRow });
        }
        return mockStmt({});
      }),
    } as unknown as D1Database,
    ENVIRONMENT: 'production',
    META_PAGE_ID: '107455558114139',
    META_PAGE_ACCESS_TOKEN: 'EAAG_MOCK_SECRET_PAGE_ACCESS_TOKEN_XYZ123',
  };

  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('blocks unauthenticated access to /api/admin/facebook/page-posts with 401', async () => {
    const res = await app.request('/api/admin/facebook/page-posts', {
      method: 'GET',
    });
    expect(res.status).toBe(401);
  });

  it('uses /107455558114139/posts and Graph API v26.0 (not /feed or v19.0)', async () => {
    const fetchCalls: Array<{ url: string; method: string }> = [];

    globalThis.fetch = vi.fn().mockImplementation(async (url: string | URL | Request, init?: RequestInit) => {
      const urlStr = url.toString();
      fetchCalls.push({ url: urlStr, method: init?.method || 'GET' });

      if (urlStr.includes('/107455558114139?')) {
        return new Response(
          JSON.stringify({
            id: '107455558114139',
            name: 'NorthSoft',
            fan_count: 21,
            category: 'Software House',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }

      if (urlStr.includes('/posts?')) {
        return new Response(
          JSON.stringify({
            data: [
              {
                id: '107455558114139_1422501326647234',
                message: 'Test post content from NorthSoft',
                created_time: '2026-09-06T22:12:07+0000',
                permalink_url: 'https://facebook.com/107455558114139/posts/1422501326647234',
              },
            ],
            paging: {
              cursors: { after: 'cursor_abc_123' },
              next: 'https://graph.facebook.com/v26.0/107455558114139/posts?after=cursor_abc_123',
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }

      return new Response(JSON.stringify({ error: { message: 'Not found' } }), { status: 404 });
    });

    const res = await app.request(
      '/api/admin/facebook/page-posts',
      {
        method: 'GET',
        headers: {
          Cookie: 'admin_session=valid_test_session_id',
        },
      },
      mockEnv as unknown as Record<string, unknown>,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      configured: boolean;
      posts: Array<{ id: string; message: string; permalinkUrl: string }>;
      postCount: number;
      paging: { hasMore: boolean; after: string };
      pageInfo: { name: string; id: string };
    };

    expect(body.configured).toBe(true);
    expect(body.pageInfo.name).toBe('NorthSoft');
    expect(body.posts).toHaveLength(1);
    expect(body.posts[0]!.id).toBe('107455558114139_1422501326647234');
    expect(body.posts[0]!.message).toBe('Test post content from NorthSoft');
    expect(body.paging.hasMore).toBe(true);
    expect(body.paging.after).toBe('cursor_abc_123');

    // Assert URL construction
    expect(fetchCalls.length).toBe(2);
    const postsCall = fetchCalls.find((c) => c.url.includes('/posts?'));
    expect(postsCall).toBeDefined();
    expect(postsCall!.url).toContain('graph.facebook.com/v26.0/107455558114139/posts');
    expect(postsCall!.url).not.toContain('/feed');
    expect(postsCall!.url).not.toContain('v19.0');
    expect(postsCall!.method).toBe('GET');
  });

  it('passes after parameter correctly for pagination', async () => {
    let postsRequestUrl = '';

    globalThis.fetch = vi.fn().mockImplementation(async (url: string | URL | Request) => {
      const urlStr = url.toString();
      if (urlStr.includes('/107455558114139?')) {
        return new Response(JSON.stringify({ id: '107455558114139', name: 'NorthSoft' }), {
          status: 200,
        });
      }

      if (urlStr.includes('/posts?')) {
        postsRequestUrl = urlStr;
        return new Response(JSON.stringify({ data: [] }), { status: 200 });
      }

      return new Response(JSON.stringify({ error: { message: 'Not found' } }), { status: 404 });
    });

    const res = await app.request(
      '/api/admin/facebook/page-posts?after=cursor_xyz_789&limit=5',
      {
        method: 'GET',
        headers: {
          Cookie: 'admin_session=valid_test_session_id',
        },
      },
      mockEnv as unknown as Record<string, unknown>,
    );

    expect(res.status).toBe(200);
    expect(postsRequestUrl).toContain('after=cursor_xyz_789');
    expect(postsRequestUrl).toContain('limit=5');
  });

  it('handles empty response gracefully ({ data: [] })', async () => {
    globalThis.fetch = vi.fn().mockImplementation(async (url: string | URL | Request) => {
      const urlStr = url.toString();
      if (urlStr.includes('/107455558114139?')) {
        return new Response(JSON.stringify({ id: '107455558114139', name: 'NorthSoft' }), {
          status: 200,
        });
      }

      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    });

    const res = await app.request(
      '/api/admin/facebook/page-posts',
      {
        method: 'GET',
        headers: {
          Cookie: 'admin_session=valid_test_session_id',
        },
      },
      mockEnv as unknown as Record<string, unknown>,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { posts: unknown[]; postCount: number };
    expect(body.posts).toEqual([]);
    expect(body.postCount).toBe(0);
  });

  it('handles missing message by falling back to story field', async () => {
    globalThis.fetch = vi.fn().mockImplementation(async (url: string | URL | Request) => {
      const urlStr = url.toString();
      if (urlStr.includes('/107455558114139?')) {
        return new Response(JSON.stringify({ id: '107455558114139', name: 'NorthSoft' }), {
          status: 200,
        });
      }

      return new Response(
        JSON.stringify({
          data: [
            {
              id: '107455558114139_9999',
              story: 'NorthSoft updated their cover photo.',
              created_time: '2026-09-01T12:00:00+0000',
            },
          ],
        }),
        { status: 200 },
      );
    });

    const res = await app.request(
      '/api/admin/facebook/page-posts',
      {
        method: 'GET',
        headers: {
          Cookie: 'admin_session=valid_test_session_id',
        },
      },
      mockEnv as unknown as Record<string, unknown>,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { posts: Array<{ message: string }> };
    expect(body.posts[0]!.message).toBe('NorthSoft updated their cover photo.');
  });

  it('sanitizes secret tokens in Meta error responses', async () => {
    globalThis.fetch = vi.fn().mockImplementation(async (url: string | URL | Request) => {
      const urlStr = url.toString();
      if (urlStr.includes('/107455558114139?')) {
        return new Response(JSON.stringify({ id: '107455558114139', name: 'NorthSoft' }), {
          status: 200,
        });
      }

      return new Response(
        JSON.stringify({
          error: {
            message:
              'Invalid token EAAG_MOCK_SECRET_PAGE_ACCESS_TOKEN_XYZ123 passed in access_token=EAAG_MOCK_SECRET_PAGE_ACCESS_TOKEN_XYZ123',
            code: 190,
          },
        }),
        { status: 400 },
      );
    });

    const res = await app.request(
      '/api/admin/facebook/page-posts',
      {
        method: 'GET',
        headers: {
          Cookie: 'admin_session=valid_test_session_id',
        },
      },
      mockEnv as unknown as Record<string, unknown>,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { error: string; errorCode: number };
    expect(body.errorCode).toBe(190);
    expect(body.error).not.toContain('access_token=EAAG_MOCK_SECRET_PAGE_ACCESS_TOKEN_XYZ123');
    expect(body.error).toContain('access_token=[REDACTED]');
  });

  it('never exposes page access token in successful JSON responses', async () => {
    globalThis.fetch = vi.fn().mockImplementation(async (url: string | URL | Request) => {
      const urlStr = url.toString();
      if (urlStr.includes('/107455558114139?')) {
        return new Response(JSON.stringify({ id: '107455558114139', name: 'NorthSoft' }), {
          status: 200,
        });
      }

      return new Response(
        JSON.stringify({
          data: [{ id: '107455558114139_001', message: 'Hello world' }],
        }),
        { status: 200 },
      );
    });

    const res = await app.request(
      '/api/admin/facebook/page-posts',
      {
        method: 'GET',
        headers: {
          Cookie: 'admin_session=valid_test_session_id',
        },
      },
      mockEnv as unknown as Record<string, unknown>,
    );

    const jsonText = await res.text();
    expect(jsonText).not.toContain('EAAG_MOCK_SECRET_PAGE_ACCESS_TOKEN_XYZ123');
  });
});
