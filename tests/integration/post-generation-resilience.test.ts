import { describe, expect, it, vi } from 'vitest';
import { ContentPlannerService } from '../../src/services/content/content-planner-service';
import type { IAIProvider } from '../../src/ai/provider';

describe('Post Generation Resilience & Data Integrity', () => {
  const sampleTopic = {
    id: 'topic-resilience-1',
    title: 'Cloudflare Workers AI Security',
    description: 'Securing serverless edge functions with Cloudflare.',
    category: 'WEBSITE',
  };

  const sampleSources = [
    {
      id: 'src-1',
      title: 'Cloudflare Security Docs',
      url: 'https://developers.cloudflare.com',
      summary: 'Edge functions security guidelines.',
    },
  ];

  function createMockDb() {
    const postsMap = new Map<string, Record<string, unknown>>();
    const versionsMap = new Map<string, Record<string, unknown>>();

    const prepare = (sql: string) => {
      const normSql = sql.replace(/\s+/g, ' ').trim();
      let boundArgs: unknown[] = [];

      const stmt = {
        bind: (...args: unknown[]) => {
          boundArgs = args;
          return stmt;
        },
        first: async <T>() => {
          if (normSql.includes('FROM content_ideas WHERE id = ?')) {
            return (boundArgs[0] === sampleTopic.id ? sampleTopic : null) as unknown as T;
          }
          if (normSql.includes('FROM ai_usage')) {
            return { req_total: 10, neuron_total: 500 } as unknown as T;
          }
          return null as unknown as T;
        },
        all: async <T>() => {
          if (normSql.includes('FROM research_items')) {
            return { results: sampleSources as unknown as T[] };
          }
          return { results: [] as T[] };
        },
        run: async () => {
          if (normSql.startsWith('INSERT INTO posts')) {
            const id = boundArgs[0] as string;
            postsMap.set(id, {
              id,
              idea_id: boundArgs[1],
              title: boundArgs[2],
              status: boundArgs[3],
              current_version: boundArgs[4],
              created_at: boundArgs[5],
            });
          } else if (normSql.startsWith('INSERT INTO post_versions')) {
            const id = boundArgs[0] as string;
            versionsMap.set(id, {
              id,
              post_id: boundArgs[1],
              version_number: boundArgs[2],
              content: boundArgs[3],
              metadata: boundArgs[4],
              ai_model: boundArgs[5],
              ai_provider: boundArgs[6],
            });
          } else if (normSql.startsWith('UPDATE posts SET status =')) {
            const id = boundArgs[boundArgs.length - 1] as string;
            const p = postsMap.get(id);
            if (p) p.status = boundArgs[0];
          }
          return { success: true };
        },
      };
      return stmt;
    };

    const batch = async (statements: Array<{ run?: () => Promise<unknown> }>) => {
      for (const s of statements) {
        if (s && typeof s.run === 'function') {
          await s.run();
        }
      }
      return [];
    };

    return {
      db: { prepare, batch } as unknown as D1Database,
      postsMap,
      versionsMap,
    };
  }

  it('1 & 7 & 8: Successful AI generation creates both posts and post_versions atomically and links them', async () => {
    const { db, postsMap, versionsMap } = createMockDb();
    const mockEnv = { ENVIRONMENT: 'development', DB: db } as unknown as Env;

    const planner = new ContentPlannerService(db, mockEnv);
    const result = await planner.generatePostFromTopic(sampleTopic.id, 'admin');

    expect(result.status).toBe('approved');
    expect(result.postId).toBeDefined();

    expect(postsMap.size).toBe(1);
    expect(versionsMap.size).toBeGreaterThanOrEqual(1);

    const post = postsMap.get(result.postId!);
    expect(post).toBeDefined();
    expect(post?.title).toBe(sampleTopic.title);
    expect(post?.idea_id).toBe(sampleTopic.id);

    const version = Array.from(versionsMap.values()).find((v) => v.post_id === result.postId);
    expect(version).toBeDefined();
    expect(typeof version?.content).toBe('string');
    expect((version?.content as string).length).toBeGreaterThan(0);
  });

  it('2 & 6: Empty AI response produces NO orphan posts record in DB', async () => {
    const { db, postsMap, versionsMap } = createMockDb();

    // Mock Writer AI returning empty content
    const mockWriterProvider: IAIProvider = {
      name: 'mock',
      complete: vi.fn().mockResolvedValue({
        content: '   ',
        model: 'mock',
        provider: 'mock',
        durationMs: 10,
        usage: { promptTokens: 10, completionTokens: 0, totalTokens: 10 },
      }),
      healthCheck: vi.fn().mockResolvedValue({ healthy: true, durationMs: 5 }),
    };

    const mockEnv = {
      ENVIRONMENT: 'development',
      DB: db,
    } as unknown as Env;

    // Spy getAIProvider to return mockWriterProvider
    const factory = await import('../../src/ai/factory');
    vi.spyOn(factory, 'getAIProvider').mockReturnValue(mockWriterProvider);

    const planner = new ContentPlannerService(db, mockEnv);
    const result = await planner.generatePostFromTopic(sampleTopic.id, 'admin');

    expect(result.status).toBe('failed');
    expect(result.postId).toBeUndefined();
    expect(result.errorMessage).toBeDefined();

    // CRITICAL REQUIREMENT: NO INCOMPLETE POST RECORD LEFT IN D1
    expect(postsMap.size).toBe(0);
    expect(versionsMap.size).toBe(0);
  });

  it('3 & 6: Malformed AI JSON response produces NO incomplete posts record in DB', async () => {
    const { db, postsMap, versionsMap } = createMockDb();

    const mockWriterProvider: IAIProvider = {
      name: 'mock',
      complete: vi.fn().mockResolvedValue({
        content: 'This is not valid JSON at all: { broken json ...',
        model: 'mock',
        provider: 'mock',
        durationMs: 10,
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      }),
      healthCheck: vi.fn().mockResolvedValue({ healthy: true, durationMs: 5 }),
    };

    const mockEnv = { ENVIRONMENT: 'development', DB: db } as unknown as Env;
    const factory = await import('../../src/ai/factory');
    vi.spyOn(factory, 'getAIProvider').mockReturnValue(mockWriterProvider);

    const planner = new ContentPlannerService(db, mockEnv);
    const result = await planner.generatePostFromTopic(sampleTopic.id, 'admin');

    expect(result.status).toBe('failed');
    expect(result.postId).toBeUndefined();
    expect(result.errorMessage).toContain('malformed JSON');

    // NO INCOMPLETE POST RECORD LEFT IN D1
    expect(postsMap.size).toBe(0);
    expect(versionsMap.size).toBe(0);
  });

  it('4 & 6: AI / API failure produces NO incomplete posts record in DB', async () => {
    const { db, postsMap, versionsMap } = createMockDb();

    const mockWriterProvider: IAIProvider = {
      name: 'mock',
      complete: vi.fn().mockRejectedValue(new Error('Workers AI 503 Service Unavailable')),
      healthCheck: vi.fn().mockResolvedValue({ healthy: true, durationMs: 5 }),
    };

    const mockEnv = { ENVIRONMENT: 'development', DB: db } as unknown as Env;
    const factory = await import('../../src/ai/factory');
    vi.spyOn(factory, 'getAIProvider').mockReturnValue(mockWriterProvider);

    const planner = new ContentPlannerService(db, mockEnv);
    const result = await planner.generatePostFromTopic(sampleTopic.id, 'admin');

    expect(result.status).toBe('failed');
    expect(result.postId).toBeUndefined();
    expect(result.errorMessage).toContain('503 Service Unavailable');

    // NO INCOMPLETE POST RECORD LEFT IN D1
    expect(postsMap.size).toBe(0);
    expect(versionsMap.size).toBe(0);
  });
});
