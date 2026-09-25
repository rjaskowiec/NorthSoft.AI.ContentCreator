import { describe, expect, it, vi } from 'vitest';
import { app } from '../../src/index';

describe('Autonomous Pipeline & Scheduling Integration API', () => {
  const mockStmt = (data: { first?: unknown; all?: unknown; run?: unknown }) => {
    const stmt = {
      first: vi.fn().mockResolvedValue(data.first ?? null),
      all: vi.fn().mockResolvedValue(data.all ?? { results: [] }),
      run: vi.fn().mockResolvedValue(data.run ?? { success: true }),
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

  it('blocks unauthenticated POST /api/admin/pipeline/run with 401', async () => {
    const res = await app.request('/api/admin/pipeline/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(401);
  });

  it('blocks authenticated POST /api/admin/pipeline/run without CSRF token with 403', async () => {
    const sessionCookie = 'admin_session=valid_test_session_id';
    const mockDb = {
      prepare: vi.fn((sql: string) => {
        if (sql.includes('admin_sessions')) {
          return mockStmt({ first: mockSessionRow });
        }
        return mockStmt({});
      }),
    } as unknown as D1Database;

    const res = await app.request(
      '/api/admin/pipeline/run',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: sessionCookie,
        },
      },
      {
        ENVIRONMENT: 'development',
        DB: mockDb,
        ADMIN_AUTH_SECRET: 'test_secret_key_at_least_32_bytes_long_12345',
      },
    );

    expect(res.status).toBe(403);
  });

  it('allows authenticated GET /api/admin/schedules and returns scheduled queue', async () => {
    const sessionCookie = 'admin_session=valid_test_session_id';
    const scheduledRow = {
      id: 'sched-1',
      post_id: 'post-1',
      scheduled_at: new Date(Date.now() + 86400000).toISOString(),
      timezone: 'UTC',
      status: 'pending',
      created_at: new Date().toISOString(),
      post_title: 'Serverless Edge Optimization',
      quality_score: 88,
      quality_decision: 'PASS',
      current_version: 1,
    };

    const mockDb = {
      prepare: vi.fn((sql: string) => {
        if (sql.includes('admin_sessions')) {
          return mockStmt({ first: mockSessionRow });
        }
        if (sql.includes('FROM schedules s')) {
          return mockStmt({ all: { results: [scheduledRow] } });
        }
        return mockStmt({});
      }),
    } as unknown as D1Database;

    const res = await app.request(
      '/api/admin/schedules',
      {
        method: 'GET',
        headers: { Cookie: sessionCookie },
      },
      {
        ENVIRONMENT: 'development',
        DB: mockDb,
        ADMIN_AUTH_SECRET: 'test_secret_key_at_least_32_bytes_long_12345',
      },
    );

    expect(res.status).toBe(200);
    const data = (await res.json()) as { schedules: Array<typeof scheduledRow> };
    expect(data.schedules).toHaveLength(1);
    expect(data.schedules[0]?.post_title).toBe('Serverless Edge Optimization');
  });
});
