import { describe, expect, it, beforeEach } from 'vitest';
import { CloudflareUsageService } from '../../src/services/cloudflare/cloudflare-usage-service';

describe('CloudflareUsageService Unit Tests', () => {
  beforeEach(() => {
    CloudflareUsageService.resetCache();
  });

  it('returns NOT_CONFIGURED when credentials are missing', async () => {
    const service = new CloudflareUsageService({});
    const result = await service.getVerifiedUsage();

    expect(result.status).toBe('NOT_CONFIGURED');
    expect(result.actualNeurons).toBeNull();
    expect(result.actualRequests).toBeNull();
    expect(result.source).toBe('Not Configured');
    expect(result.dashboardUrl).toBe('https://dash.cloudflare.com/');
    expect(result.reason).toContain('CLOUDFLARE_API_TOKEN');
  });

  it('parses valid GraphQL response from Cloudflare API and returns VERIFIED usage', async () => {
    const mockFetch = async () =>
      new Response(
        JSON.stringify({
          data: {
            viewer: {
              accounts: [
                {
                  aiInferenceAdaptiveGroups: [
                    { count: 12, sum: { neurons: 5432.7 } },
                    { count: 4, sum: { neurons: 1890.3 } },
                  ],
                },
              ],
            },
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );

    const service = new CloudflareUsageService(
      { accountId: 'test-account', apiToken: 'test-token' },
      mockFetch as unknown as typeof fetch,
    );

    const result = await service.getVerifiedUsage();

    expect(result.status).toBe('VERIFIED');
    expect(result.actualRequests).toBe(16);
    expect(result.actualNeurons).toBe(7323); // Math.round(5432.7 + 1890.3)
    expect(result.source).toBe('Cloudflare Analytics GraphQL API');
    expect(result.period).toBe('Today (UTC)');
    expect(result.dashboardUrl).toBe('https://dash.cloudflare.com/');
  });

  it('handles GraphQL errors gracefully without crashing or fabricating fake data', async () => {
    const mockFetch = async () =>
      new Response(
        JSON.stringify({
          errors: [{ message: 'Authentication token has expired or is invalid.' }],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );

    const service = new CloudflareUsageService(
      { accountId: 'test-account', apiToken: 'invalid-token' },
      mockFetch as unknown as typeof fetch,
    );

    const result = await service.getVerifiedUsage();

    expect(result.status).toBe('API_ERROR');
    expect(result.actualNeurons).toBeNull();
    expect(result.actualRequests).toBeNull();
    expect(result.reason).toContain('Authentication token has expired');
    expect(result.dashboardUrl).toBe('https://dash.cloudflare.com/');
  });

  it('handles HTTP error status codes (e.g. 403 Forbidden) gracefully', async () => {
    const mockFetch = async () =>
      new Response('Forbidden: Invalid permissions', { status: 403 });

    const service = new CloudflareUsageService(
      { accountId: 'test-account', apiToken: 'test-token' },
      mockFetch as unknown as typeof fetch,
    );

    const result = await service.getVerifiedUsage();

    expect(result.status).toBe('API_ERROR');
    expect(result.actualNeurons).toBeNull();
    expect(result.reason).toContain('403');
  });

  it('caches responses for 60 seconds unless forceRefresh is passed', async () => {
    let callCount = 0;
    const mockFetch = async () => {
      callCount++;
      return new Response(
        JSON.stringify({
          data: {
            viewer: {
              accounts: [
                {
                  aiInferenceAdaptiveGroups: [{ count: callCount * 10, sum: { neurons: 1000 } }],
                },
              ],
            },
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    };

    const service = new CloudflareUsageService(
      { accountId: 'acc', apiToken: 'tok' },
      mockFetch as unknown as typeof fetch,
    );

    const res1 = await service.getVerifiedUsage();
    expect(res1.actualRequests).toBe(10);
    expect(callCount).toBe(1);

    // Second call uses cache
    const res2 = await service.getVerifiedUsage();
    expect(res2.actualRequests).toBe(10);
    expect(callCount).toBe(1);

    // Force refresh bypasses cache
    const res3 = await service.getVerifiedUsage({ forceRefresh: true });
    expect(res3.actualRequests).toBe(20);
    expect(callCount).toBe(2);
  });

  describe('D1 Usage & Database-Specific Telemetry', () => {
    it('returns NOT_CONFIGURED when credentials are not configured', async () => {
      const service = new CloudflareUsageService({});
      const result = await service.getVerifiedD1Usage();

      expect(result.status).toBe('NOT_CONFIGURED');
      expect(result.rowsRead).toBeNull();
      expect(result.rowsWritten).toBeNull();
      expect(result.source).toBe('Not Configured');
    });

    it('parses valid GraphQL response with database dimensions and separates database usage from account aggregate', async () => {
      const mockFetch = async () =>
        new Response(
          JSON.stringify({
            data: {
              viewer: {
                accounts: [
                  {
                    d1AnalyticsAdaptiveGroups: [
                      {
                        dimensions: { databaseId: '902bbe67-adda-4797-af9a-a09ec57d5538' },
                        sum: { rowsWritten: 50, rowsRead: 1200, writeQueries: 5, readQueries: 30 },
                      },
                      {
                        dimensions: { databaseId: '7c50529d-eb49-4f12-9a33-6fe33e37f27a' },
                        sum: { rowsWritten: 100, rowsRead: 8000, writeQueries: 10, readQueries: 120 },
                      },
                    ],
                  },
                ],
              },
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );

      const service = new CloudflareUsageService(
        {
          accountId: 'test-acc',
          apiToken: 'test-tok',
          databaseId: '902bbe67-adda-4797-af9a-a09ec57d5538',
        },
        mockFetch as unknown as typeof fetch,
      );

      const result = await service.getVerifiedD1Usage();

      expect(result.status).toBe('VERIFIED');
      expect(result.rowsRead).toBe(9200); // 1200 + 8000 (account total)
      expect(result.rowsWritten).toBe(150);
      expect(result.readQueries).toBe(150);
      expect(result.writeQueries).toBe(15);
      expect(result.scope).toBe('account_aggregate');

      expect(result.databaseUsage).toBeDefined();
      expect(result.databaseUsage?.databaseId).toBe('902bbe67-adda-4797-af9a-a09ec57d5538');
      expect(result.databaseUsage?.rowsRead).toBe(1200);
      expect(result.databaseUsage?.rowsWritten).toBe(50);
      expect(result.databaseUsage?.readQueries).toBe(30);

      expect(result.databases).toHaveLength(2);
    });
  });
});
