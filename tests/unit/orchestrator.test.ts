import { describe, expect, it, vi } from 'vitest';
import { ContentOrchestrator } from '../../src/services/content/content-orchestrator';

describe('ContentOrchestrator — Unit & Budget Protection', () => {
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

  it('defers execution when concurrent run is currently in progress', async () => {
    const prepareMock = vi.fn((sql: string) => {
      if (sql.includes('FROM orchestrator_runs WHERE status = "running"')) {
        return mockStmt({ first: { id: 'orch-active-123' } });
      }
      return mockStmt({});
    });

    const mockDb = { prepare: prepareMock } as unknown as D1Database;
    const mockEnv = { ENVIRONMENT: 'development', DB: mockDb } as unknown as Env;

    const orchestrator = new ContentOrchestrator(mockDb, mockEnv);
    const result = await orchestrator.runPipeline('cron');

    expect(result.status).toBe('deferred');
    expect(result.errorMessage).toContain('Concurrent orchestrator run in progress');
    expect(result.neuronsUsed).toBe(0);
  });

  it('defers execution when daily post limit (1 post/day) is reached', async () => {
    const prepareMock = vi.fn((sql: string) => {
      if (sql.includes('FROM orchestrator_runs WHERE status = "running"')) {
        return mockStmt({ first: null });
      }
      if (sql.includes('FROM content_ideas WHERE status IN')) {
        return mockStmt({ first: { cnt: 5 } });
      }
      if (sql.includes('FROM posts WHERE date(created_at) = ?')) {
        return mockStmt({ first: { cnt: 1 } });
      }
      return mockStmt({});
    });

    const mockDb = { prepare: prepareMock } as unknown as D1Database;
    const mockEnv = { ENVIRONMENT: 'development', DB: mockDb } as unknown as Env;

    const orchestrator = new ContentOrchestrator(mockDb, mockEnv);
    const result = await orchestrator.runPipeline('cron');

    expect(result.status).toBe('deferred');
    expect(result.errorMessage).toContain('Daily post generation limit reached');
    expect(result.neuronsUsed).toBe(0);
  });

  it('defers execution and makes ZERO AI calls when Neuron Hard Budget (7,500) is exhausted', async () => {
    const candidateTopic = {
      id: 'topic-99',
      title: 'Zero Trust Network Architecture',
      description: 'Implementing Zero Trust principles at the edge.',
      category: 'Security',
      priority: 90,
    };

    const prepareMock = vi.fn((sql: string) => {
      if (sql.includes('FROM orchestrator_runs WHERE status = "running"')) {
        return mockStmt({ first: null });
      }
      if (sql.includes('FROM content_ideas')) {
        if (sql.includes('COUNT(*)')) {
          return mockStmt({ first: { cnt: 1 } });
        }
        return mockStmt({ all: { results: [candidateTopic] } });
      }
      if (sql.includes('FROM posts WHERE date(created_at) = ?')) {
        return mockStmt({ first: { cnt: 0 } });
      }
      if (sql.includes('FROM posts p')) {
        return mockStmt({ first: null });
      }
      if (sql.includes('FROM ai_usage')) {
        return mockStmt({ first: { req_total: 25, neuron_total: 7400 } });
      }
      return mockStmt({});
    });

    const mockDb = { prepare: prepareMock } as unknown as D1Database;
    const mockEnv = { ENVIRONMENT: 'development', DB: mockDb } as unknown as Env;

    const orchestrator = new ContentOrchestrator(mockDb, mockEnv);
    const result = await orchestrator.runPipeline('cron');

    expect(result.status).toBe('deferred');
    expect(result.errorMessage).toContain('Neuron hard limit reached');
    expect(result.neuronsUsed).toBe(0);
  });
});
