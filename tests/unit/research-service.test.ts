import { describe, expect, it, vi } from 'vitest';
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
      if (sql.includes("status IN ('NEW', 'DEFERRED')")) {
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
      if (sql.includes("status IN ('NEW', 'DEFERRED')")) {
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
});
