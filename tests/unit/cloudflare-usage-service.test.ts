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
});
