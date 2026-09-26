import { describe, expect, it, vi } from 'vitest';
import { app } from '../../src/index';

describe('Admin Audit Log API (/api/admin/audit)', () => {
  it('blocks unauthenticated access to /api/admin/audit with 401 Unauthorized', async () => {
    const res = await app.request('/api/admin/audit');
    expect(res.status).toBe(401);
    const data = (await res.json()) as { error: string; message: string };
    expect(data.error).toBe('Unauthorized');
    expect(data.message).toBe('Authentication required');
  });

  it('allows authenticated admin access and returns paginated events, pagination metadata, and stats', async () => {
    const mockSessionRow = {
      session_id: 'sess-admin-1',
      admin_user_id: 'user-001',
      token_hash: 'token-hash',
      csrf_secret: 'csrf-secret-123',
      expires_at: new Date(Date.now() + 3600000).toISOString(),
      session_created_at: new Date().toISOString(),
      last_seen_at: new Date().toISOString(),
      revoked_at: null,
      ip_address: '127.0.0.1',
      user_agent: 'Vitest',
      user_id: 'user-001',
      username: 'rjaskowiec',
      user_status: 'active',
      user_created_at: new Date().toISOString(),
      user_updated_at: new Date().toISOString(),
      last_login_at: new Date().toISOString(),
    };

    const mockEventsRow = [
      {
        id: 'evt-1',
        event_type: 'AI_RESEARCH_FAILED',
        entity_type: 'research_item',
        entity_id: 'item-100',
        actor: 'ai',
        details: JSON.stringify({ title: 'Performance Improvements in .NET 11' }),
        created_at: new Date().toISOString(),
        level: 'ERROR',
        operation: 'Performance Improvements in .NET 11',
        status: 'FAILED',
        duration_ms: 2840,
        correlation_id: 'run-999',
        error_code: 'AI_COMPLETION_ERROR',
        error_message: 'Cloudflare Workers AI HTTP 500',
        error_stage: 'Workers AI completion',
        http_status: 500,
      },
    ];

    const mockCountRow = { cnt: 1 };
    const mockStatsRow = {
      totalEvents: 1,
      errorCount: 1,
      warningCount: 0,
      successCount: 0,
      aiOperations: 1,
    };

    const prepareMock = vi.fn().mockImplementation((sql: string) => {
      if (sql.includes('FROM admin_sessions')) {
        return {
          bind: vi.fn().mockReturnValue({
            first: vi.fn().mockResolvedValue(mockSessionRow),
          }),
        };
      }
      if (sql.includes('SELECT COUNT(*) as cnt FROM audit_log')) {
        return {
          bind: vi.fn().mockReturnValue({
            first: vi.fn().mockResolvedValue(mockCountRow),
          }),
        };
      }
      if (sql.includes('COUNT(*) as totalEvents')) {
        return {
          first: vi.fn().mockResolvedValue(mockStatsRow),
        };
      }
      if (sql.includes('FROM audit_log')) {
        return {
          bind: vi.fn().mockReturnValue({
            all: vi.fn().mockResolvedValue({ results: mockEventsRow }),
          }),
        };
      }
      return {
        bind: vi.fn().mockReturnValue({
          run: vi.fn().mockResolvedValue({ success: true }),
          all: vi.fn().mockResolvedValue({ results: [] }),
          first: vi.fn().mockResolvedValue(null),
        }),
      };
    });

    const env = {
      DB: { prepare: prepareMock } as unknown as D1Database,
      ADMIN_AUTH_SECRET: 'test-secret-12345678901234567890',
    };

    const res = await app.request(
      '/api/admin/audit?category=errors&page=1&pageSize=10&search=Performance',
      {
        headers: {
          Cookie: 'admin_session=valid-raw-token',
        },
      },
      env,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      events: Array<{ eventType: string; operation: string; error: { message: string } }>;
      pagination: { page: number; pageSize: number; totalCount: number; totalPages: number };
      stats: { totalEvents: number; errorCount: number; aiOperations: number };
    };

    expect(body.events).toHaveLength(1);
    expect(body.events[0].eventType).toBe('AI_RESEARCH_FAILED');
    expect(body.events[0].operation).toBe('Performance Improvements in .NET 11');
    expect(body.events[0].error.message).toBe('Cloudflare Workers AI HTTP 500');

    expect(body.pagination).toEqual({
      page: 1,
      pageSize: 10,
      totalCount: 1,
      totalPages: 1,
    });

    expect(body.stats).toEqual(mockStatsRow);
  });
});
