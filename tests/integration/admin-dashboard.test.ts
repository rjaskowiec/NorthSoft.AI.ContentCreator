import { describe, expect, it, vi } from 'vitest';
import { app } from '../../src/index';

interface ErrorResponse {
  error: string;
  message: string;
}

interface DashboardResponse {
  systemStatus: {
    application: string;
    environment: string;
    worker: string;
    database: string;
    aiProvider: string;
    facebookPublisher: string;
    publishing: string;
  };
  pipeline: {
    ideas: number;
    drafts: number;
    awaitingQa: number;
    approved: number;
    scheduled: number;
    published: number;
    blocked: number;
  };
  securityStatus: {
    authentication: string;
    sessionType: string;
    csrfProtection: string;
    bruteForceProtection: string;
    facebookPublishing: string;
    aiProvider: string;
  };
}

describe('Admin Dashboard Integration & Security', () => {
  it('blocks unauthenticated access to /api/admin/dashboard with 401', async () => {
    const res = await app.request('/api/admin/dashboard');
    expect(res.status).toBe(401);
    const data = (await res.json()) as ErrorResponse;
    expect(data.error).toBe('Unauthorized');
    expect(data.message).toBe('Authentication required');
  });

  it('blocks unauthenticated access to /api/admin/settings with 401', async () => {
    const res = await app.request('/api/admin/settings');
    expect(res.status).toBe(401);
    const data = (await res.json()) as ErrorResponse;
    expect(data.error).toBe('Unauthorized');
  });

  it('serves admin HTML dashboard UI at /admin with security headers', async () => {
    const res = await app.request('/admin');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');

    // Security headers
    expect(res.headers.get('x-frame-options')).toBe('DENY');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('content-security-policy')).toBeDefined();

    const html = await res.text();
    expect(html).toContain('NorthSoft AI');
    expect(html).toContain('Content Creator Admin Interface');
    expect(html).toContain('Authenticate');
    expect(html).toContain('facebook-rail');
    expect(html).toContain('fb-rail-posts-container');
    expect(html).toContain('val-fb-config');
    expect(html).toContain('val-fb-read');
    expect(html).toContain('val-fb-publishing');
    expect(html).toContain('loadFacebookPagePosts');
  });

  it('allows authenticated access to /api/admin/dashboard and returns safe metrics', async () => {
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

    const mockCounts = {
      ideas: 5,
      drafts: 2,
      awaiting_qa: 1,
      approved: 3,
      scheduled: 0,
      published: 10,
      blocked: 0,
    };

    const runMock = vi.fn().mockResolvedValue({ success: true });
    const prepareMock = vi.fn((sql: string) => {
      if (sql.includes('FROM admin_sessions')) {
        return {
          bind: vi.fn().mockReturnValue({
            first: vi.fn().mockResolvedValue(mockSessionRow),
          }),
        };
      }
      if (sql.includes('SELECT COUNT(*) FROM content_ideas') || sql.includes('as ideas')) {
        return {
          first: vi.fn().mockResolvedValue(mockCounts),
        };
      }
      if (sql.includes('FROM audit_log')) {
        return {
          bind: vi.fn().mockReturnValue({
            all: vi.fn().mockResolvedValue({ results: [] }),
          }),
        };
      }
      return {
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue(null),
          all: vi.fn().mockResolvedValue({ results: [] }),
          run: runMock,
        }),
      };
    });

    const mockEnv = {
      DB: { prepare: prepareMock } as unknown as D1Database,
      ENVIRONMENT: 'staging',
      FACEBOOK_PUBLISH_ENABLED: 'false',
      LOG_LEVEL: 'debug',
    };

    const res = await app.request(
      '/api/admin/dashboard',
      {
        method: 'GET',
        headers: {
          Cookie: 'admin_session=valid-admin-token-xyz',
        },
      },
      mockEnv,
    );

    expect(res.status).toBe(200);
    const data = (await res.json()) as DashboardResponse;
    expect(data.systemStatus.application).toBe('NorthSoft AI — Content Creator');
    expect(data.systemStatus.environment).toBe('Staging');
    expect(data.systemStatus.worker).toBe('Healthy');
    expect(data.systemStatus.database).toBe('Connected');
    expect(data.systemStatus.aiProvider).toBe('Mock (Development)');
    expect(data.systemStatus.facebookPublisher).toBe('NOT_CONFIGURED');
    expect(data.systemStatus.publishing).toBe('Disabled');

    expect(data.pipeline.ideas).toBe(5);
    expect(data.pipeline.published).toBe(10);
    expect(data.securityStatus.facebookPublishing).toBe('DISABLED');
    expect(data.securityStatus.authentication).toBe('Enabled');
  });
});
