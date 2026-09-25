import { describe, expect, it, vi } from 'vitest';
import { app } from '../../src/index';

describe('Publication API Integration Tests', () => {
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
    ENVIRONMENT: 'staging',
    FACEBOOK_PUBLISH_ENABLED: 'false',
    META_PAGE_ID: '',
    META_PAGE_ACCESS_TOKEN: '',
  };

  it('blocks unauthenticated GET /api/admin/publications with 401', async () => {
    const res = await app.request('/api/admin/publications', {
      method: 'GET',
    });

    expect(res.status).toBe(401);
  });

  it('allows authenticated GET /api/admin/meta/status and returns safe diagnostic metadata', async () => {
    const res = await app.request(
      '/api/admin/meta/status',
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
      status: string;
      environment: string;
      pageConfigured: boolean;
      accessTokenConfigured: boolean;
      publishingEnabled: boolean;
      graphApiVersion: string;
      statusMessage: string;
    };
    expect(body.status).toBe('NOT_CONFIGURED');
    expect(body.environment).toBe('staging');
    expect(body.pageConfigured).toBe(false);
    expect(body.accessTokenConfigured).toBe(false);
    expect(body.publishingEnabled).toBe(false);
    expect(body.graphApiVersion).toBe('v19.0');
    expect(body.statusMessage).toContain('NOT CONFIGURED');
  });

  it('blocks authenticated POST /api/admin/publications/pub-1/publish without CSRF token with 403', async () => {
    const res = await app.request(
      '/api/admin/publications/pub-1/publish',
      {
        method: 'POST',
        headers: {
          Cookie: 'admin_session=valid_test_session_id',
        },
      },
      mockEnv as unknown as Record<string, unknown>,
    );

    expect(res.status).toBe(403);
  });

  it('allows authenticated GET /api/admin/publications and returns configStatus and queue', async () => {
    const pubRes = await app.request(
      '/api/admin/publications',
      {
        method: 'GET',
        headers: {
          Cookie: 'admin_session=valid_test_session_id',
        },
      },
      mockEnv as unknown as Record<string, unknown>,
    );

    expect(pubRes.status).toBe(200);
    const body = (await pubRes.json()) as {
      publications: unknown[];
      configStatus: { configured: boolean };
    };
    expect(body.publications).toBeDefined();
    expect(body.configStatus).toBeDefined();
    expect(body.configStatus.configured).toBe(false);
  });

  it('blocks unauthenticated POST /api/admin/publications/manual with 401', async () => {
    const res = await app.request('/api/admin/publications/manual', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'Test post content' }),
    });

    expect(res.status).toBe(401);
  });

  it('blocks authenticated POST /api/admin/publications/manual without CSRF token with 403', async () => {
    const res = await app.request(
      '/api/admin/publications/manual',
      {
        method: 'POST',
        headers: {
          Cookie: 'admin_session=valid_test_session_id',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content: 'Test post content' }),
      },
      mockEnv as unknown as Record<string, unknown>,
    );

    expect(res.status).toBe(403);
  });

  it('validates empty content on POST /api/admin/publications/manual with 400', async () => {
    const enabledEnv = {
      ...mockEnv,
      FACEBOOK_PUBLISH_ENABLED: 'true',
      META_PAGE_ID: 'page_123',
      META_PAGE_ACCESS_TOKEN: 'token_123',
      ENVIRONMENT: 'production',
    };

    const res = await app.request(
      '/api/admin/publications/manual',
      {
        method: 'POST',
        headers: {
          Cookie: 'admin_session=valid_test_session_id',
          'x-csrf-token': 'csrf_secret_key_123',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content: '   ' }),
      },
      enabledEnv as unknown as Record<string, unknown>,
    );

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain('Post content cannot be empty');
  });

  it('handles manual publish when publisher is NOT_CONFIGURED with 400', async () => {
    const res = await app.request(
      '/api/admin/publications/manual',
      {
        method: 'POST',
        headers: {
          Cookie: 'admin_session=valid_test_session_id',
          'x-csrf-token': 'csrf_secret_key_123',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content: 'Manual publication test message' }),
      },
      mockEnv as unknown as Record<string, unknown>,
    );

    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string; error: string };
    expect(body.code).toBe('META_NOT_CONFIGURED');
    expect(body.error).toContain('NOT CONFIGURED');
  });
});
