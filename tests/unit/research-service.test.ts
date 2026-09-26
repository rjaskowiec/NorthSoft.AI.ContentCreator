import { describe, expect, it, vi } from 'vitest';
import { getAIProvider } from '../../src/ai/factory';
import { MockAIProvider } from '../../src/ai/mock-provider';
import { ResearchService } from '../../src/services/research/research-service';

function createMockStatement(firstVal: unknown = null, allResults: unknown[] = [], runRes = { success: true }) {
  const stmt: Record<string, unknown> = {};
  stmt.first = vi.fn().mockResolvedValue(firstVal);
  stmt.all = vi.fn().mockResolvedValue({ results: allResults });
  stmt.run = vi.fn().mockResolvedValue(runRes);
  stmt.bind = vi.fn().mockReturnValue(stmt);
  return stmt;
}

describe('ResearchService Pipeline', () => {
  it('prevents concurrent execution when a run is already in progress', async () => {
    const mockDb = {
      prepare: vi.fn((sql: string) => {
        if (sql.includes('research_runs')) {
          return createMockStatement({ id: 'active-run-123' });
        }
        return createMockStatement();
      }),
    } as unknown as D1Database;

    const mockAi = new MockAIProvider();
    const service = new ResearchService(mockDb, mockAi);

    const summary = await service.runResearchPipeline('cron');

    expect(summary.status).toBe('completed');
    expect(summary.sourcesChecked).toBe(0);
    expect(summary.errorMessage).toContain('in progress');
  });

  it('runs research pipeline successfully and calculates operational diagnostics', async () => {
    const mockSources = [
      {
        id: 'src-1',
        name: 'HubSpot Marketing',
        url: 'https://blog.hubspot.com/marketing/rss.xml',
        type: 'rss',
        category: 'MARKETING',
        enabled: 1,
        priority: 10,
      },
    ];

    const mockNewItems = [
      {
        id: 'item-1',
        source_id: 'src-1',
        title: '5 Ways Small Businesses Can Get More Leads From Google Search',
        url: 'https://blog.hubspot.com/local-seo-leads',
        url_hash: 'hash123',
        content_summary: 'Optimizing your website and Google Business profile to attract local customers online.',
        published_at: new Date().toISOString(),
      },
    ];

    const prepareMock = vi.fn((sql: string) => {
      if (sql.includes("status = 'running'")) {
        return createMockStatement(null);
      }
      if (sql.includes('FROM research_sources')) {
        return createMockStatement(null, mockSources);
      }
      if (sql.includes('FROM research_items')) {
        return createMockStatement(null, mockNewItems);
      }
      return createMockStatement(null, []);
    });

    const mockDb = { prepare: prepareMock } as unknown as D1Database;

    const sampleXml = `
      <rss version="2.0">
        <channel>
          <item>
            <title>5 Ways Small Businesses Can Get More Leads From Google Search</title>
            <link>https://blog.hubspot.com/local-seo-leads</link>
            <description>Optimizing your website and Google Business profile to attract local customers online.</description>
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
    expect(summary.sourcesChecked).toBeGreaterThanOrEqual(1);
    expect(summary.itemsDiscovered).toBeGreaterThanOrEqual(1);
    expect(summary.itemsNormalized).toBeGreaterThanOrEqual(1);
    expect(summary.topicsCreated).toBeGreaterThanOrEqual(1);
    expect(summary.pillarBreakdown).toBeDefined();
  });

  it('accurately records 0 candidate topics when items fail relevance check', async () => {
    const mockSources = [
      {
        id: 'src-gossip',
        name: 'Gossip Feed',
        url: 'https://gossip.example.com/rss',
        type: 'rss',
        category: 'General',
        enabled: 1,
        priority: 5,
      },
    ];

    const mockGossipItems = [
      {
        id: 'item-gossip',
        source_id: 'src-gossip',
        title: 'Hollywood Red Carpet Gossip and Premier League Football',
        url: 'https://gossip.example.com/red-carpet',
        url_hash: 'hashgossip',
        content_summary: 'Celebrity news and scores from football match.',
        published_at: new Date().toISOString(),
      },
    ];

    const prepareMock = vi.fn((sql: string) => {
      if (sql.includes("status = 'running'")) {
        return createMockStatement(null);
      }
      if (sql.includes('FROM research_sources')) {
        return createMockStatement(null, mockSources);
      }
      if (sql.includes('FROM research_items')) {
        return createMockStatement(null, mockGossipItems);
      }
      return createMockStatement(null, []);
    });

    const mockDb = { prepare: prepareMock } as unknown as D1Database;

    const gossipXml = `
      <rss version="2.0">
        <channel>
          <item>
            <title>Hollywood Red Carpet Gossip and Premier League Football</title>
            <link>https://gossip.example.com/red-carpet</link>
            <description>Celebrity news and scores from football match.</description>
          </item>
        </channel>
      </rss>
    `;

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/xml' }),
      text: () => Promise.resolve(gossipXml),
    }) as unknown as typeof fetch;

    const mockAi = new MockAIProvider();
    const service = new ResearchService(mockDb, mockAi);

    const summary = await service.runResearchPipeline('manual');

    expect(summary.status).toBe('completed');
    expect(summary.topicsCreated).toBe(0);
    expect(summary.rejectedIrrelevant).toBeGreaterThanOrEqual(1);
  });

  it('throws an explicit error when env.AI binding is missing in production or staging', () => {
    const mockEnv = { ENVIRONMENT: 'production' } as unknown as Env;

    expect(() => getAIProvider(mockEnv, 'researcher')).toThrow(
      /Cloudflare Workers AI binding \(env\.AI\) is missing/,
    );
  });

  it('explicitly records AI inference requests vs fallback executions', async () => {
    const mockSources = [
      {
        id: 'src-tech',
        name: 'Tech Blog',
        url: 'https://tech.example.com/rss',
        type: 'rss',
        category: 'WEBSITE',
        enabled: 1,
        priority: 10,
      },
    ];

    const mockItems = [
      {
        id: 'item-tech-1',
        source_id: 'src-tech',
        title: '3 Simple Website Updates That Increase Client Inquiries for Local Services',
        url: 'https://tech.example.com/website-tips',
        url_hash: 'hash-tech-1',
        content_summary: 'Simple practical ways to improve local service business contact rates.',
        published_at: new Date().toISOString(),
      },
    ];

    const prepareMock = vi.fn((sql: string) => {
      if (sql.includes("status = 'running'")) return createMockStatement(null);
      if (sql.includes('FROM research_sources')) return createMockStatement(null, mockSources);
      if (sql.includes('FROM research_items')) return createMockStatement(null, mockItems);
      return createMockStatement(null, []);
    });

    const mockDb = { prepare: prepareMock } as unknown as D1Database;
    const mockAi = new MockAIProvider();
    const service = new ResearchService(mockDb, mockAi);

    const summary = await service.runResearchPipeline('manual');

    expect(summary.aiInferenceRequests).toBeGreaterThanOrEqual(1);
    expect(summary.aiProviderName).toBe('mock');
    expect(summary.fallbackExecutions).toBe(1);
  });

  it('handles NO_USEFUL_ANGLE gracefully without forcing artificial content ideas', async () => {
    const mockSources = [
      {
        id: 'src-niche',
        name: 'Niche Feed',
        url: 'https://niche.example.com/rss',
        type: 'rss',
        category: 'WEBSITE',
        enabled: 1,
        priority: 10,
      },
    ];

    const mockItems = [
      {
        id: 'item-niche',
        source_id: 'src-niche',
        title: 'Compiler Bytecode Optimization Techniques in Rust 1.85',
        url: 'https://niche.example.com/rust-compiler',
        url_hash: 'hash-niche',
        content_summary: 'Deep internal compiler bytecode transformations.',
        published_at: new Date().toISOString(),
      },
    ];

    const prepareMock = vi.fn((sql: string) => {
      if (sql.includes("status = 'running'")) return createMockStatement(null);
      if (sql.includes('FROM research_sources')) return createMockStatement(null, mockSources);
      if (sql.includes('FROM research_items')) return createMockStatement(null, mockItems);
      return createMockStatement(null, []);
    });

    const mockDb = { prepare: prepareMock } as unknown as D1Database;
    const mockAiProvider = {
      name: 'cloudflare-workers-ai',
      complete: vi.fn().mockResolvedValue({
        content: JSON.stringify({ usefulAngle: false, reason: 'NO_USEFUL_ANGLE' }),
        model: '@cf/meta/llama-3.1-8b-instruct',
        provider: 'cloudflare-workers-ai',
        usage: { promptTokens: 100, completionTokens: 20, totalTokens: 120 },
        finishReason: 'stop',
        durationMs: 150,
      }),
      healthCheck: vi.fn().mockResolvedValue(true),
    };

    const service = new ResearchService(mockDb, mockAiProvider as unknown as MockAIProvider);
    const summary = await service.runResearchPipeline('manual');

    expect(summary.aiInferenceRequests).toBe(1);
    expect(summary.aiInferenceSuccessful).toBe(1);
    expect(summary.noUsefulAngleCount).toBe(1);
    expect(summary.ideasQueued).toBe(0);
    expect(summary.fallbackExecutions).toBe(0);
  });
});
