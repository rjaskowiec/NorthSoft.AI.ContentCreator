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
    META_PUBLISH_ENABLED: 'false',
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
});
