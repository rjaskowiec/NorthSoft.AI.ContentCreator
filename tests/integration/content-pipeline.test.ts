import { describe, expect, it, vi } from 'vitest';
import { ContentPlannerService } from '../../src/services/content/content-planner-service';

describe('Content Planner & Pipeline Integration', () => {
  it('orchestrates complete topic-to-post pipeline resulting in APPROVED post', async () => {
    const topicRow = {
      id: 'topic-100',
      title: 'Edge Compute Optimization with Cloudflare Workers',
      description: 'How edge computing reduces latency and server overhead.',
      category: 'Cloudflare',
    };

    const sourcesRows = [
      {
        id: 'src-100',
        title: 'Edge Compute Cloudflare Blog',
        url: 'https://blog.cloudflare.com/edge-compute',
        summary: 'Cloudflare Workers enable serverless code execution directly at the edge.',
      },
    ];

    const runMock = vi.fn().mockResolvedValue({ success: true });
    const prepareMock = vi.fn((sql: string) => {
      if (sql.includes('FROM content_ideas WHERE id = ?')) {
        return { bind: vi.fn().mockReturnValue({ first: vi.fn().mockResolvedValue(topicRow) }) };
      }
      if (sql.includes('FROM research_items')) {
        return { all: vi.fn().mockResolvedValue({ results: sourcesRows }) };
      }
      if (sql.includes('FROM ai_usage')) {
        return {
          bind: vi.fn().mockReturnValue({
            first: vi.fn().mockResolvedValue({ req_total: 2, neuron_total: 1500 }),
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

    const mockDb = { prepare: prepareMock } as unknown as D1Database;
    const mockEnv = { ENVIRONMENT: 'development', DB: mockDb } as unknown as Env;

    const planner = new ContentPlannerService(mockDb, mockEnv);
    const result = await planner.generatePostFromTopic('topic-100', 'admin');

    expect(result.status).toBe('approved');
    expect(result.currentVersion).toBe(1);
    expect(result.qualityDecision).toBe('PASS');
    expect(result.qualityScore).toBeGreaterThanOrEqual(70);
  });

  it('defers draft generation when Neuron hard budget (7,500) is reached', async () => {
    const topicRow = {
      id: 'topic-200',
      title: 'Serverless Security Safeguards',
      description: 'Best practices for serverless security.',
      category: 'Security',
    };

    const prepareMock = vi.fn((sql: string) => {
      if (sql.includes('FROM content_ideas WHERE id = ?')) {
        return { bind: vi.fn().mockReturnValue({ first: vi.fn().mockResolvedValue(topicRow) }) };
      }
      if (sql.includes('FROM research_items')) {
        return { all: vi.fn().mockResolvedValue({ results: [] }) };
      }
      if (sql.includes('FROM ai_usage')) {
        // Return 7,600 neurons used today (exceeds 7,500 hard limit)
        return {
          bind: vi.fn().mockReturnValue({
            first: vi.fn().mockResolvedValue({ req_total: 20, neuron_total: 7600 }),
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

    const mockDb = { prepare: prepareMock } as unknown as D1Database;
    const mockEnv = { ENVIRONMENT: 'development', DB: mockDb } as unknown as Env;

    const planner = new ContentPlannerService(mockDb, mockEnv);
    const result = await planner.generatePostFromTopic('topic-200', 'system');

    expect(result.status).toBe('deferred');
    expect(result.errorMessage).toContain('Neuron hard limit reached');
  });
});
