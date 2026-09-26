/**
 * NorthSoft.AI.ContentCreator — Cloudflare Usage Service
 *
 * Fetches OFFICIAL, VERIFIED Workers AI usage telemetry directly from Cloudflare's
 * GraphQL Analytics API (https://api.cloudflare.com/client/v4/graphql).
 *
 * Strictly enforced rules:
 *  - ZERO ESTIMATIONS represented as Cloudflare usage.
 *  - If credentials (CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID) are missing or API fails,
 *    gracefully returns status: 'NOT_CONFIGURED' or 'API_ERROR' without throwing.
 *  - Always provides a link to official Cloudflare Dashboard (https://dash.cloudflare.com/).
 */

export interface CloudflareVerifiedUsage {
  status: 'VERIFIED' | 'NOT_CONFIGURED' | 'API_ERROR' | 'DATA_DELAYED';
  actualNeurons: number | null;
  actualRequests: number | null;
  period: string;
  lastUpdated: string | null;
  source: string;
  reason?: string;
  dashboardUrl: string;
}

interface CacheEntry {
  data: CloudflareVerifiedUsage;
  cachedAt: number;
}

let usageCache: CacheEntry | null = null;
const CACHE_TTL_MS = 60 * 1000; // 60 seconds cache

export class CloudflareUsageService {
  private accountId?: string;
  private apiToken?: string;
  private fetchFn: typeof fetch;

  constructor(
    config?: { accountId?: string; apiToken?: string },
    customFetch?: typeof fetch,
  ) {
    this.accountId = config?.accountId;
    this.apiToken = config?.apiToken;
    this.fetchFn = customFetch || globalThis.fetch.bind(globalThis);
  }

  /**
   * Helper factory to instantiate CloudflareUsageService from Worker Env.
   */
  static fromEnv(env?: Env): CloudflareUsageService {
    return new CloudflareUsageService({
      accountId: env?.CLOUDFLARE_ACCOUNT_ID,
      apiToken: env?.CLOUDFLARE_API_TOKEN,
    });
  }

  /**
   * Fetches official Cloudflare Workers AI telemetry from GraphQL Analytics API.
   */
  async getVerifiedUsage(options?: { forceRefresh?: boolean }): Promise<CloudflareVerifiedUsage> {
    const now = Date.now();
    const dashboardUrl = 'https://dash.cloudflare.com/';

    // 1. Check in-memory cache
    if (!options?.forceRefresh && usageCache && now - usageCache.cachedAt < CACHE_TTL_MS) {
      return usageCache.data;
    }

    // 2. Validate configuration
    if (!this.accountId || !this.apiToken) {
      const result: CloudflareVerifiedUsage = {
        status: 'NOT_CONFIGURED',
        actualNeurons: null,
        actualRequests: null,
        period: 'Today (UTC)',
        lastUpdated: null,
        source: 'Not Configured',
        reason:
          'Cloudflare API Token or Account ID missing in environment secrets (CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID). Telemetry unavailable via API.',
        dashboardUrl,
      };
      usageCache = { data: result, cachedAt: now };
      return result;
    }

    // 3. Prepare GraphQL query for today's UTC telemetry
    const todayStr = new Date().toISOString().split('T')[0] ?? '';
    const startUtcIso = `${todayStr}T00:00:00Z`;

    const query = `
      query GetWorkersAIUsage($accountTag: String!, $start: String!) {
        viewer {
          accounts(filter: { accountTag: $accountTag }) {
            aiInferenceAdaptiveGroups(
              limit: 1000
              filter: { datetime_geq: $start }
            ) {
              count
              sum {
                neurons
              }
              dimensions {
                model
              }
            }
          }
        }
      }
    `;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await this.fetchFn('https://api.cloudflare.com/client/v4/graphql', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query,
          variables: {
            accountTag: this.accountId,
            start: startUtcIso,
          },
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errText = await response.text();
        const result: CloudflareVerifiedUsage = {
          status: 'API_ERROR',
          actualNeurons: null,
          actualRequests: null,
          period: 'Today (UTC)',
          lastUpdated: new Date().toISOString(),
          source: 'Cloudflare Analytics API (Error)',
          reason: `Cloudflare API returned status ${response.status}: ${errText.substring(0, 150)}`,
          dashboardUrl,
        };
        return result;
      }

      const json = (await response.json()) as {
        data?: {
          viewer?: {
            accounts?: Array<{
              aiInferenceAdaptiveGroups?: Array<{
                count: number;
                sum?: { neurons?: number };
              }>;
            }>;
          };
        };
        errors?: Array<{ message: string }>;
      };

      if (json.errors && json.errors.length > 0) {
        const errMsg = json.errors.map((e) => e.message).join('; ');
        const result: CloudflareVerifiedUsage = {
          status: 'API_ERROR',
          actualNeurons: null,
          actualRequests: null,
          period: 'Today (UTC)',
          lastUpdated: new Date().toISOString(),
          source: 'Cloudflare Analytics API (Error)',
          reason: `GraphQL error from Cloudflare API: ${errMsg.substring(0, 150)}`,
          dashboardUrl,
        };
        return result;
      }

      const groups = json.data?.viewer?.accounts?.[0]?.aiInferenceAdaptiveGroups || [];

      let totalRequests = 0;
      let totalNeurons = 0;

      for (const group of groups) {
        totalRequests += group.count || 0;
        totalNeurons += group.sum?.neurons || 0;
      }

      const result: CloudflareVerifiedUsage = {
        status: 'VERIFIED',
        actualNeurons: Math.round(totalNeurons),
        actualRequests: totalRequests,
        period: 'Today (UTC)',
        lastUpdated: new Date().toISOString(),
        source: 'Cloudflare Analytics GraphQL API',
        dashboardUrl,
      };

      usageCache = { data: result, cachedAt: now };
      return result;
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      const result: CloudflareVerifiedUsage = {
        status: 'API_ERROR',
        actualNeurons: null,
        actualRequests: null,
        period: 'Today (UTC)',
        lastUpdated: new Date().toISOString(),
        source: 'Cloudflare Analytics API (Failed)',
        reason: `Network/API connection failure: ${errMsg}`,
        dashboardUrl,
      };
      return result;
    }
  }

  /**
   * Resets internal cache (useful for testing).
   */
  static resetCache(): void {
    usageCache = null;
  }
}
