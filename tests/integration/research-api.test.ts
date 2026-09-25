import { describe, expect, it, vi } from 'vitest';
import { app } from '../../src/index';

interface ErrorResponse {
  error: string;
  message?: string;
}

interface ResearchApiResponse {
  sources: Array<{ name: string; url: string }>;
  topics: Array<{ title: string; category: string }>;
  runs: Array<{ id: string; status: string }>;
  stats: {
    totalSources: number;
    enabledSources: number;
    totalTopicsDiscovered: number;
  };
}

describe('Research Admin API Integration', () => {
  it('blocks unauthenticated GET /api/admin/research with 401', async () => {
    const res = await app.request('/api/admin/research');
    expect(res.status).toBe(401);
    const data = (await res.json()) as ErrorResponse;
    expect(data.error).toBe('Unauthorized');
  });

  it('blocks unauthenticated POST /api/admin/research/run with 401', async () => {
    const res = await app.request('/api/admin/research/run', { method: 'POST' });
    expect(res.status).toBe(401);
    const data = (await res.json()) as ErrorResponse;
    expect(data.error).toBe('Unauthorized');
  });

  it('blocks authenticated POST /api/admin/research/run without CSRF token with 403', async () => {
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
    };

    const prepareMock = vi.fn((sql: string) => {
      if (sql.includes('FROM admin_sessions')) {
        return {
          bind: vi.fn().mockReturnValue({
            first: vi.fn().mockResolvedValue(mockSessionRow),
          }),
        };
      }
      return {
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue(null),
          all: vi.fn().mockResolvedValue({ results: [] }),
          run: vi.fn().mockResolvedValue({ success: true }),
        }),
      };
    });

    const mockEnv = {
      DB: { prepare: prepareMock } as unknown as D1Database,
      ENVIRONMENT: 'staging',
      META_PUBLISH_ENABLED: 'false',
    };

    const res = await app.request(
      '/api/admin/research/run',
      {
        method: 'POST',
        headers: {
          Cookie: 'admin_session=valid-admin-token-xyz',
        },
      },
      mockEnv,
    );

    expect(res.status).toBe(403);
    const data = (await res.json()) as ErrorResponse;
    expect(data.error).toBe('Forbidden');
  });

  it('allows authenticated GET /api/admin/research and returns metrics', async () => {
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

    const mockSources = [
      { id: 's1', name: 'Cloudflare', url: 'https://blog.cloudflare.com/rss/', enabled: 1 },
    ];
    const mockTopics = [{ id: 't1', title: 'New Cloudflare Tech', category: 'Cloudflare' }];
    const mockRuns = [
      {
        id: 'r1',
        trigger_type: 'manual',
        status: 'completed',
        started_at: new Date().toISOString(),
      },
    ];

    const prepareMock = vi.fn((sql: string) => {
      if (sql.includes('FROM admin_sessions')) {
        return {
          bind: vi.fn().mockReturnValue({
            first: vi.fn().mockResolvedValue(mockSessionRow),
          }),
        };
      }
      if (sql.includes('FROM research_sources')) {
        return { all: vi.fn().mockResolvedValue({ results: mockSources }) };
      }
      if (sql.includes('FROM content_ideas')) {
        return { all: vi.fn().mockResolvedValue({ results: mockTopics }) };
      }
      if (sql.includes('FROM research_runs')) {
        return { all: vi.fn().mockResolvedValue({ results: mockRuns }) };
      }
      return {
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue(null),
          all: vi.fn().mockResolvedValue({ results: [] }),
          run: vi.fn().mockResolvedValue({ success: true }),
        }),
      };
    });

    const mockEnv = {
      DB: { prepare: prepareMock } as unknown as D1Database,
      ENVIRONMENT: 'staging',
      META_PUBLISH_ENABLED: 'false',
    };

    const res = await app.request(
      '/api/admin/research',
      {
        method: 'GET',
        headers: {
          Cookie: 'admin_session=valid-admin-token-xyz',
        },
      },
      mockEnv,
    );

    expect(res.status).toBe(200);
    const data = (await res.json()) as ResearchApiResponse;
    expect(data.sources).toHaveLength(1);
    expect(data.topics).toHaveLength(1);
    expect(data.runs).toHaveLength(1);
    expect(data.stats.enabledSources).toBe(1);
  });
});
