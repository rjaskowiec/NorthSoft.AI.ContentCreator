import { describe, expect, it, vi } from 'vitest';
import { app } from '../../src/index';

describe('Admin UI Integrity & Pipeline Endpoint Security', () => {
  it('serves /admin HTML containing all 9 tabs and navigation elements', async () => {
    const res = await app.request('/admin');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');

    const html = await res.text();

    // Verify all required navigation items exist
    expect(html).toContain('id="nav-dashboard"');
    expect(html).toContain('id="nav-pipeline"');
    expect(html).toContain('id="nav-content"');
    expect(html).toContain('id="nav-research"');
    expect(html).toContain('id="nav-schedules"');
    expect(html).toContain('id="nav-publications"');
    expect(html).toContain('id="nav-manual-publisher"');
    expect(html).toContain('id="nav-audit"');
    expect(html).toContain('id="nav-security"');

    // Verify all required tab sections exist
    expect(html).toContain('id="tab-dashboard"');
    expect(html).toContain('id="tab-pipeline"');
    expect(html).toContain('id="tab-content"');
    expect(html).toContain('id="tab-research"');
    expect(html).toContain('id="tab-schedules"');
    expect(html).toContain('id="tab-publications"');
    expect(html).toContain('id="tab-manual-publisher"');
    expect(html).toContain('id="tab-audit"');
    expect(html).toContain('id="tab-security"');

    // Verify client JS contains switchTab, pipeline functions and DOM readiness check
    expect(html).toContain('function switchTab');
    expect(html).toContain('function loadPipelineData');
    expect(html).toContain('function runDiscoveryNow');
    expect(html).toContain('function runPostGenerationNow');
    expect(html).toContain('function runPublishNow');
    expect(html).toContain('function runFullPipelineNow');
    expect(html).toContain('function saveSchedulerConfig');
    expect(html).toContain("document.readyState === 'loading'");
    expect(html).toContain('window.switchTab = switchTab');
    expect(html).toContain('window.loadPipelineData = loadPipelineData');
  });

  it('rejects unauthenticated access to pipeline control endpoints', async () => {
    const endpoints = [
      { path: '/api/admin/pipeline/discovery', method: 'POST' },
      { path: '/api/admin/pipeline/generate', method: 'POST' },
      { path: '/api/admin/pipeline/publish', method: 'POST' },
      { path: '/api/admin/pipeline/run-full', method: 'POST' },
      { path: '/api/admin/pipeline/scheduler', method: 'POST' },
    ];

    for (const ep of endpoints) {
      const res = await app.request(ep.path, {
        method: ep.method,
        headers: { 'Content-Type': 'application/json' },
      });
      expect(res.status).toBe(401);
    }
  });

  it('allows authenticated GET /api/admin/pipeline/scheduler and returns default config', async () => {
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

    const prepareMock = vi.fn((sql: string) => {
      if (sql.includes('FROM admin_sessions')) {
        return {
          bind: vi.fn().mockReturnValue({
            first: vi.fn().mockResolvedValue(mockSessionRow),
            run: vi.fn().mockResolvedValue({ success: true }),
          }),
        };
      }
      if (sql.includes('FROM pipeline_scheduler_config')) {
        return {
          first: vi.fn().mockResolvedValue(null),
          bind: vi.fn().mockReturnValue({
            first: vi.fn().mockResolvedValue(null),
            run: vi.fn().mockResolvedValue({ success: true }),
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
    };

    const res = await app.request(
      '/api/admin/pipeline/scheduler',
      {
        method: 'GET',
        headers: {
          Cookie: 'admin_session=valid-admin-token-xyz',
        },
      },
      mockEnv,
    );

    expect(res.status).toBe(200);
    const data = (await res.json()) as { config: { enabled: boolean; frequency: string } };
    expect(data.config).toBeDefined();
    expect(data.config.enabled).toBe(false);
    expect(data.config.frequency).toBe('daily');
  });
});
