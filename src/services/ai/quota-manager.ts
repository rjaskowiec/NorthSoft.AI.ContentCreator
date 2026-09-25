/**
 * NorthSoft.AI.ContentCreator — AI Quota & Capacity Manager
 *
 * Enforces CRITICAL BUSINESS REQUIREMENT: ZERO AI COST (MAX_ALLOWED_AI_COST = 0).
 *
 * Prevents paid AI inference charges, enforces application-level daily/monthly limits,
 * tracks usage in D1, and provides capacity status checks before AI requests.
 */

export const MAX_ALLOWED_AI_COST = 0;

export const DEFAULT_AI_LIMITS = {
  maxRequestsPerRun: 5,
  maxRequestsPerDay: 50,
  maxRequestsPerMonth: 1000,
};

export const ALLOWED_FREE_PROVIDERS = ['cloudflare-workers-ai', 'mock'] as const;
export type FreeProviderName = (typeof ALLOWED_FREE_PROVIDERS)[number];

export interface CapacityStatus {
  allowed: boolean;
  status: 'FREE_CAPACITY_AVAILABLE' | 'DEFERRED_NO_FREE_AI_CAPACITY';
  provider: string;
  model: string;
  todayRequests: number;
  dailyLimit: number;
  monthRequests: number;
  monthlyLimit: number;
  reason?: string;
}

export interface RecordUsageParams {
  provider: string;
  model: string;
  role: string;
  inputTokens?: number;
  outputTokens?: number;
  success: boolean;
  durationMs?: number;
  errorMessage?: string;
}

export class QuotaManager {
  private dailyLimit: number;
  private monthlyLimit: number;

  constructor(limits?: Partial<typeof DEFAULT_AI_LIMITS>) {
    this.dailyLimit = limits?.maxRequestsPerDay ?? DEFAULT_AI_LIMITS.maxRequestsPerDay;
    this.monthlyLimit = limits?.maxRequestsPerMonth ?? DEFAULT_AI_LIMITS.maxRequestsPerMonth;
  }

  /**
   * Check if free capacity is available for an AI request.
   * NEVER returns allowed=true for a paid provider.
   */
  async checkCapacity(db: D1Database, provider: string, model: string): Promise<CapacityStatus> {
    const normalizedProvider = provider.toLowerCase().trim();

    // Enforce zero cost policy: Paid providers are strictly prohibited
    const isFreeProvider = ALLOWED_FREE_PROVIDERS.includes(normalizedProvider as FreeProviderName);
    if (!isFreeProvider) {
      return {
        allowed: false,
        status: 'DEFERRED_NO_FREE_AI_CAPACITY',
        provider: normalizedProvider,
        model,
        todayRequests: 0,
        dailyLimit: this.dailyLimit,
        monthRequests: 0,
        monthlyLimit: this.monthlyLimit,
        reason: `Provider '${normalizedProvider}' is not a verified free AI provider. Paid AI providers are strictly prohibited.`,
      };
    }

    const todayStr = new Date().toISOString().split('T')[0] ?? ''; // YYYY-MM-DD
    const monthStr = todayStr.substring(0, 7); // YYYY-MM

    try {
      // Query today's request count
      const todayResult = await db
        .prepare('SELECT SUM(request_count) as total FROM ai_usage WHERE date = ?')
        .bind(todayStr)
        .first<{ total: number | null }>();
      const todayRequests = todayResult?.total ?? 0;

      // Query month's request count
      const monthResult = await db
        .prepare('SELECT SUM(request_count) as total FROM ai_usage WHERE date LIKE ?')
        .bind(`${monthStr}%`)
        .first<{ total: number | null }>();
      const monthRequests = monthResult?.total ?? 0;

      if (todayRequests >= this.dailyLimit) {
        return {
          allowed: false,
          status: 'DEFERRED_NO_FREE_AI_CAPACITY',
          provider: normalizedProvider,
          model,
          todayRequests,
          dailyLimit: this.dailyLimit,
          monthRequests,
          monthlyLimit: this.monthlyLimit,
          reason: `Daily free AI limit reached (${todayRequests}/${this.dailyLimit} requests today).`,
        };
      }

      if (monthRequests >= this.monthlyLimit) {
        return {
          allowed: false,
          status: 'DEFERRED_NO_FREE_AI_CAPACITY',
          provider: normalizedProvider,
          model,
          todayRequests,
          dailyLimit: this.dailyLimit,
          monthRequests,
          monthlyLimit: this.monthlyLimit,
          reason: `Monthly free AI limit reached (${monthRequests}/${this.monthlyLimit} requests this month).`,
        };
      }

      return {
        allowed: true,
        status: 'FREE_CAPACITY_AVAILABLE',
        provider: normalizedProvider,
        model,
        todayRequests,
        dailyLimit: this.dailyLimit,
        monthRequests,
        monthlyLimit: this.monthlyLimit,
      };
    } catch {
      // If DB error, fail-safe to deferred to avoid accidental paid usage
      return {
        allowed: false,
        status: 'DEFERRED_NO_FREE_AI_CAPACITY',
        provider: normalizedProvider,
        model,
        todayRequests: 0,
        dailyLimit: this.dailyLimit,
        monthRequests: 0,
        monthlyLimit: this.monthlyLimit,
        reason: 'Database error while checking AI capacity.',
      };
    }
  }

  /**
   * Record AI request usage and execution metrics in D1.
   */
  async recordUsage(db: D1Database, params: RecordUsageParams): Promise<void> {
    const todayStr = new Date().toISOString().split('T')[0] ?? '';
    const id = `usage-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const inputTokens = params.inputTokens ?? 0;
    const outputTokens = params.outputTokens ?? 0;
    const failedIncrement = params.success ? 0 : 1;

    try {
      // 1. Upsert into ai_usage aggregate table
      await db
        .prepare(
          `
          INSERT INTO ai_usage (id, provider, model, role, date, request_count, input_tokens, output_tokens, failed_count)
          VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)
          ON CONFLICT(provider, model, role, date) DO UPDATE SET
            request_count = request_count + 1,
            input_tokens = input_tokens + excluded.input_tokens,
            output_tokens = output_tokens + excluded.output_tokens,
            failed_count = failed_count + excluded.failed_count,
            updated_at = datetime('now')
        `,
        )
        .bind(
          id,
          params.provider.toLowerCase(),
          params.model,
          params.role,
          todayStr,
          inputTokens,
          outputTokens,
          failedIncrement,
        )
        .run();

      // 2. Insert into ai_runs execution audit log
      const runId = `run-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      await db
        .prepare(
          `
          INSERT INTO ai_runs (id, role, model, provider, prompt_tokens, completion_tokens, total_tokens, duration_ms, status, error_message)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        )
        .bind(
          runId,
          params.role,
          params.model,
          params.provider.toLowerCase(),
          inputTokens,
          outputTokens,
          inputTokens + outputTokens,
          params.durationMs ?? 0,
          params.success ? 'completed' : 'failed',
          params.errorMessage || null,
        )
        .run();
    } catch (err) {
      console.error('[QUOTA] Failed to record AI usage in D1:', err);
    }
  }

  /**
   * Fetch aggregate AI usage stats for admin reporting.
   */
  async getUsageSummary(db: D1Database): Promise<{
    todayRequests: number;
    dailyLimit: number;
    monthRequests: number;
    monthlyLimit: number;
    status: 'FREE_CAPACITY_AVAILABLE' | 'DEFERRED_NO_FREE_AI_CAPACITY';
    provider: string;
  }> {
    const todayStr = new Date().toISOString().split('T')[0] ?? '';
    const monthStr = todayStr.substring(0, 7);

    try {
      const todayResult = await db
        .prepare('SELECT SUM(request_count) as total FROM ai_usage WHERE date = ?')
        .bind(todayStr)
        .first<{ total: number | null }>();
      const todayRequests = todayResult?.total ?? 0;

      const monthResult = await db
        .prepare('SELECT SUM(request_count) as total FROM ai_usage WHERE date LIKE ?')
        .bind(`${monthStr}%`)
        .first<{ total: number | null }>();
      const monthRequests = monthResult?.total ?? 0;

      const available = todayRequests < this.dailyLimit && monthRequests < this.monthlyLimit;

      return {
        todayRequests,
        dailyLimit: this.dailyLimit,
        monthRequests,
        monthlyLimit: this.monthlyLimit,
        status: available ? 'FREE_CAPACITY_AVAILABLE' : 'DEFERRED_NO_FREE_AI_CAPACITY',
        provider: 'Cloudflare Workers AI',
      };
    } catch {
      return {
        todayRequests: 0,
        dailyLimit: this.dailyLimit,
        monthRequests: 0,
        monthlyLimit: this.monthlyLimit,
        status: 'FREE_CAPACITY_AVAILABLE',
        provider: 'Cloudflare Workers AI',
      };
    }
  }
}
