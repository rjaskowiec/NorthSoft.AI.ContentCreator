import { describe, expect, it, vi } from 'vitest';
import { app } from '../../src/index';

function createMockDb() {
  const topicsMap = new Map<string, Record<string, unknown>>();

  // Create a topic so it can be 'found' by ContentPlannerService
  topicsMap.set('topic-422', {
    id: 'topic-422',
    title: 'Test Topic',
    description: 'Desc',
    category: 'TEST',
    priority: 50,
    status: 'queued'
  });

  const prepare = vi.fn((sql: string) => {
    const normSql = sql.replace(/\s+/g, ' ').trim();

    if (normSql.includes('FROM admin_sessions')) {
      return {
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue({
            session_id: 'sess-1',
            admin_user_id: 'user-001',
            token_hash: 'token-hash',
            csrf_secret: 'csrf-123',
            expires_at: new Date(Date.now() + 3600000).toISOString(),
            session_created_at: new Date().toISOString(),
            last_seen_at: new Date().toISOString(),
            revoked_at: null,
            user_id: 'user-001',
            username: 'admin',
            user_status: 'active'
          }),
        }),
      };
    }

    if (normSql.includes('FROM content_ideas WHERE id = ?')) {
      return {
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue(topicsMap.get('topic-422')),
        }),
      };
    }

    if (normSql.includes('FROM research_items')) {
      return {
        bind: vi.fn().mockReturnValue({
          all: vi.fn().mockResolvedValue({ results: [] }),
        }),
        all: vi.fn().mockResolvedValue({ results: [] }),
      };
    }

    if (normSql.includes('FROM ai_usage')) {
      return {
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue({ req_total: 10, neuron_total: 100 }),
        }),
      };
    }
    
    if (normSql.includes('INSERT INTO content_ideas')) {
      return {
        bind: vi.fn().mockReturnValue({
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

  return { prepare, batch: vi.fn().mockResolvedValue([]) } as unknown as D1Database;
}

const authHeaders = {
  Cookie: 'admin_session=valid-admin-token-xyz',
  'x-csrf-token': 'csrf-123',
  'Content-Type': 'application/json',
};

describe('Admin Content Generate API Integration', () => {
  it('POST /api/admin/content/generate returns 422 Unprocessable Content when AI generation fails', async () => {
    const mockDb = createMockDb();
    
    const mockEnv = {
      DB: mockDb,
      ENVIRONMENT: 'development',
    };

    // Mock getAIProvider to throw an error so that ContentPlannerService fails
    const factory = await import('../../src/ai/factory');
    vi.spyOn(factory, 'getAIProvider').mockReturnValue({
      name: 'mock',
      complete: vi.fn().mockRejectedValue(new Error('Simulated AI failure')),
      healthCheck: vi.fn().mockResolvedValue({ healthy: true, durationMs: 5 })
    });

    const res = await app.request('/api/admin/content/generate', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        topicId: 'topic-422'
      }),
    }, mockEnv);

    // Should be 422 because it's a known failure (AI generated failed)
    expect(res.status).toBe(422);
    
    const data = await res.json() as any;
    
    expect(data.success).toBe(false);
    expect(data.error).toBeDefined();
    expect(data.error.code).toBe('AI_GENERATION_FAILED');
    expect(data.error.message).toContain('Simulated AI failure');
    
    expect(data.result).toBeDefined();
    expect(data.result.status).toBe('failed');
    expect(data.result.errorMessage).toContain('Simulated AI failure');
  });
});
