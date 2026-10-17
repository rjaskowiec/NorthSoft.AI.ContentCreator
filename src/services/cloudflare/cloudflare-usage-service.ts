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

export interface CloudflareD1DatabaseUsage {
  databaseId: string;
  rowsWritten: number;
  rowsRead: number;
  writeQueries: number;
  readQueries: number;
}

export interface CloudflareD1Usage {
  status: 'VERIFIED' | 'NOT_CONFIGURED' | 'API_ERROR' | 'DATA_DELAYED';
  rowsWritten: number | null;
  rowsRead: number | null;
  writeQueries: number | null;
  readQueries: number | null;
  databaseUsage?: CloudflareD1DatabaseUsage | null;
  databases?: CloudflareD1DatabaseUsage[];
  scope?: string;
  period: string;
  lastUpdated: string | null;
  source: string;
  reason?: string;
  dashboardUrl: string;
}

interface CacheEntry<T> {
  data: T;
  cachedAt: number;
}

let usageCache: CacheEntry<CloudflareVerifiedUsage> | null = null;
let d1UsageCache: CacheEntry<CloudflareD1Usage> | null = null;
const CACHE_TTL_MS = 60 * 1000; // 60 seconds cache

export class CloudflareUsageService {
  private accountId?: string;
  private apiToken?: string;
  private databaseId?: string;
  private fetchFn: typeof fetch;

  constructor(
    config?: { accountId?: string; apiToken?: string; databaseId?: string },
    customFetch?: typeof fetch,
  ) {
    this.accountId = config?.accountId;
    this.apiToken = config?.apiToken;
    this.databaseId = config?.databaseId;
    this.fetchFn = customFetch || globalThis.fetch.bind(globalThis);
  }

  /**
   * Helper factory to instantiate CloudflareUsageService from Worker Env.
   */
  static fromEnv(env?: Env): CloudflareUsageService {
    const prodDbId = '902bbe67-adda-4797-af9a-a09ec57d5538';
    const stagingDbId = '960c64cd-c450-47bc-a0e6-58552aa0d824';
    const defaultDbId = env?.ENVIRONMENT === 'staging' ? stagingDbId : prodDbId;
    return new CloudflareUsageService({
      accountId: env?.CLOUDFLARE_ACCOUNT_ID,
      apiToken: env?.CLOUDFLARE_API_TOKEN,
      databaseId: env?.CLOUDFLARE_D1_DATABASE_ID || defaultDbId,
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
   * Fetches official Cloudflare D1 database usage telemetry from GraphQL Analytics API.
   * Tracks rowsWritten, rowsRead, and query counts for today (UTC).
   */
  async getVerifiedD1Usage(options?: { forceRefresh?: boolean }): Promise<CloudflareD1Usage> {
    const now = Date.now();
    const dashboardUrl = 'https://dash.cloudflare.com/';

    // 1. Check in-memory cache
    if (!options?.forceRefresh && d1UsageCache && now - d1UsageCache.cachedAt < CACHE_TTL_MS) {
      return d1UsageCache.data;
    }

    // 2. Validate configuration
    if (!this.accountId || !this.apiToken) {
      const result: CloudflareD1Usage = {
        status: 'NOT_CONFIGURED',
        rowsWritten: null,
        rowsRead: null,
        writeQueries: null,
        readQueries: null,
        period: 'Today (UTC)',
        lastUpdated: null,
        source: 'Not Configured',
        reason:
          'Cloudflare API Token or Account ID missing in environment secrets (CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID). Official D1 telemetry unavailable via API.',
        dashboardUrl,
      };
      d1UsageCache = { data: result, cachedAt: now };
      return result;
    }

    // 3. Prepare GraphQL query for today's UTC D1 telemetry
    const todayStr = new Date().toISOString().split('T')[0] ?? '';
    const startUtcIso = `${todayStr}T00:00:00Z`;

    const query = `
      query GetD1Usage($accountTag: String!, $start: String!) {
        viewer {
          accounts(filter: { accountTag: $accountTag }) {
            d1AnalyticsAdaptiveGroups(
              limit: 1000
              filter: { datetime_geq: $start }
            ) {
              dimensions {
                databaseId
              }
              sum {
                rowsWritten
                rowsRead
                writeQueries
                readQueries
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
        const result: CloudflareD1Usage = {
          status: 'API_ERROR',
          rowsWritten: null,
          rowsRead: null,
          writeQueries: null,
          readQueries: null,
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
              d1AnalyticsAdaptiveGroups?: Array<{
                dimensions?: {
                  databaseId?: string;
                };
                sum?: {
                  rowsWritten?: number;
                  rowsRead?: number;
                  writeQueries?: number;
                  readQueries?: number;
                };
              }>;
            }>;
          };
        };
        errors?: Array<{ message: string }>;
      };

      if (json.errors && json.errors.length > 0) {
        const errMsg = json.errors.map((e) => e.message).join('; ');
        const result: CloudflareD1Usage = {
          status: 'API_ERROR',
          rowsWritten: null,
          rowsRead: null,
          writeQueries: null,
          readQueries: null,
          period: 'Today (UTC)',
          lastUpdated: new Date().toISOString(),
          source: 'Cloudflare Analytics API (Error)',
          reason: `GraphQL error from Cloudflare API: ${errMsg.substring(0, 150)}`,
          dashboardUrl,
        };
        return result;
      }

      const groups = json.data?.viewer?.accounts?.[0]?.d1AnalyticsAdaptiveGroups || [];

      let totalWritten = 0;
      let totalRead = 0;
      let totalWriteQueries = 0;
      let totalReadQueries = 0;
      const databases: CloudflareD1DatabaseUsage[] = [];

      for (const group of groups) {
        const w = group.sum?.rowsWritten || 0;
        const r = group.sum?.rowsRead || 0;
        const wq = group.sum?.writeQueries || 0;
        const rq = group.sum?.readQueries || 0;

        totalWritten += w;
        totalRead += r;
        totalWriteQueries += wq;
        totalReadQueries += rq;

        if (group.dimensions?.databaseId) {
          databases.push({
            databaseId: group.dimensions.databaseId,
            rowsWritten: Math.round(w),
            rowsRead: Math.round(r),
            writeQueries: wq,
            readQueries: rq,
          });
        }
      }

      const databaseUsage = this.databaseId
        ? databases.find((d) => d.databaseId.toLowerCase() === this.databaseId?.toLowerCase()) || {
            databaseId: this.databaseId,
            rowsWritten: 0,
            rowsRead: 0,
            writeQueries: 0,
            readQueries: 0,
          }
        : null;

      const result: CloudflareD1Usage = {
        status: 'VERIFIED',
        rowsWritten: Math.round(totalWritten),
        rowsRead: Math.round(totalRead),
        writeQueries: totalWriteQueries,
        readQueries: totalReadQueries,
        databaseUsage,
        databases,
        scope: 'account_aggregate',
        period: 'Today (UTC)',
        lastUpdated: new Date().toISOString(),
        source: 'Cloudflare Analytics GraphQL API',
        dashboardUrl,
      };

      d1UsageCache = { data: result, cachedAt: now };
      return result;
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      const result: CloudflareD1Usage = {
        status: 'API_ERROR',
        rowsWritten: null,
        rowsRead: null,
        writeQueries: null,
        readQueries: null,
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
    d1UsageCache = null;
  }
}
