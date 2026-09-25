import { describe, expect, it, vi } from 'vitest';
import { MockAIProvider } from '../../src/ai/mock-provider';
import { ResearchService } from '../../src/services/research/research-service';

describe('ResearchService Pipeline', () => {
  it('prevents concurrent execution when a run is already in progress', async () => {
    const mockDb = {
      prepare: vi.fn((sql: string) => {
        if (sql.includes('research_runs')) {
          return {
            first: vi.fn().mockResolvedValue({ id: 'active-run-123' }),
          };
        }
        return {
          bind: vi.fn().mockReturnValue({
            first: vi.fn().mockResolvedValue(null),
            all: vi.fn().mockResolvedValue({ results: [] }),
            run: vi.fn().mockResolvedValue({ success: true }),
          }),
        };
      }),
    } as unknown as D1Database;

    const mockAi = new MockAIProvider();
    const service = new ResearchService(mockDb, mockAi);

    const summary = await service.runResearchPipeline('cron');

    expect(summary.status).toBe('completed');
    expect(summary.sourcesChecked).toBe(0);
    expect(summary.errorMessage).toContain('in progress');
  });

  it('runs research pipeline successfully and creates candidate topic', async () => {
    const mockSources = [
      {
        id: 'src-1',
        name: 'Cloudflare Blog',
        url: 'https://blog.cloudflare.com/rss/',
        type: 'rss',
        category: 'Cloudflare',
        enabled: 1,
        priority: 10,
      },
    ];

    const runMock = vi.fn().mockResolvedValue({ success: true });
    const prepareMock = vi.fn((sql: string) => {
      if (sql.includes("status = 'running'")) {
        return { first: vi.fn().mockResolvedValue(null) }; // No active run
      }
      if (sql.includes('FROM research_sources')) {
        return { all: vi.fn().mockResolvedValue({ results: mockSources }) };
      }
      if (sql.includes('SELECT id FROM research_items WHERE url_hash')) {
        return { bind: vi.fn().mockReturnValue({ first: vi.fn().mockResolvedValue(null) }) }; // New item
      }
      if (sql.includes("status = 'NEW'")) {
        return {
          all: vi.fn().mockResolvedValue({
            results: [
              {
                id: 'item-1',
                source_id: 'src-1',
                title: 'New Cloudflare Worker Features Released',
                url: 'https://blog.cloudflare.com/worker-features',
                url_hash: 'hash123',
                content_summary: 'Today Cloudflare introduced new Worker APIs.',
                published_at: new Date().toISOString(),
              },
            ],
          }),
        };
      }
      if (sql.includes('SELECT id FROM content_ideas WHERE title')) {
        return { bind: vi.fn().mockReturnValue({ first: vi.fn().mockResolvedValue(null) }) }; // Topic not existing
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

    // Mock global fetch for safeFetch in RssSourceAdapter
    const sampleXml = `
      <rss version="2.0">
        <channel>
          <item>
            <title>New Cloudflare Worker Features Released</title>
            <link>https://blog.cloudflare.com/worker-features</link>
            <description>Today Cloudflare introduced new Worker APIs.</description>
          </item>
        </channel>
      </rss>
    `;

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/xml' }),
      text: () => Promise.resolve(sampleXml),
    }) as unknown as typeof fetch;

    const mockAi = new MockAIProvider();
    const service = new ResearchService(mockDb, mockAi);

    const summary = await service.runResearchPipeline('manual');

    expect(summary.status).toBe('completed');
    expect(summary.sourcesChecked).toBe(1);
    expect(summary.itemsFound).toBe(1);
    expect(summary.topicsCreated).toBe(1);
  });
});
