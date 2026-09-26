/**
 * NorthSoft.AI.ContentCreator — AI Safety Guard & Quota Manager
 *
 * Enforces CRITICAL BUSINESS REQUIREMENT: ZERO PAID AI COST (MAX_ALLOWED_AI_COST = 0).
 *
 * IMPORTANT DESIGN ARCHITECTURE:
 *  1. Cloudflare Verified Telemetry: Official Neurons & Requests directly from Cloudflare
 *     GraphQL Analytics API via CloudflareUsageService.
 *  2. Application Safety Guard (Circuit Breaker): Prevents infinite loops or runaway request loops
 *     by capping daily requests at 300 requests/day.
 *  3. Internal Diagnostics: Character-length token estimates (char / 4) exist ONLY as an internal
 *     diagnostic metric. They NEVER block AI execution and are NEVER represented as Neurons.
 */

import { CloudflareUsageService, type CloudflareVerifiedUsage } from '../cloudflare/cloudflare-usage-service';

export const MAX_ALLOWED_AI_COST = 0;

export const DEFAULT_DAILY_REQUEST_SAFETY_LIMIT = 300;
export const DEFAULT_MONTHLY_REQUEST_SAFETY_LIMIT = 5000;

// Legacy export aliases for backwards compatibility
export const LOCAL_SAFETY_BUDGET_HARD_LIMIT = 7500;
export const LOCAL_SAFETY_BUDGET_SOFT_LIMIT = 6000;
export const LOCAL_SAFETY_BUDGET_TARGET = 5000;
export const CONTENT_CREATOR_DAILY_NEURON_HARD_LIMIT = 7500;
export const CONTENT_CREATOR_DAILY_NEURON_SOFT_LIMIT = 6000;
export const CONTENT_CREATOR_DAILY_NEURON_TARGET = 5000;

export type BudgetState = 'NORMAL' | 'CONTROLLED' | 'RESTRICTED' | 'HARD_STOP';

export const DEFAULT_AI_LIMITS = {
  maxRequestsPerRun: 25,
  maxRequestsPerDay: DEFAULT_DAILY_REQUEST_SAFETY_LIMIT,
  maxRequestsPerMonth: DEFAULT_MONTHLY_REQUEST_SAFETY_LIMIT,
};

export const ALLOWED_FREE_PROVIDERS = ['cloudflare-workers-ai', 'mock'] as const;
export type FreeProviderName = (typeof ALLOWED_FREE_PROVIDERS)[number];

export interface CapacityStatus {
  allowed: boolean;
  status: 'FREE_CAPACITY_AVAILABLE' | 'DEFERRED_NO_FREE_AI_CAPACITY';
  budgetState: BudgetState;
  provider: string;
  model: string;
  todayRequests: number;
  dailyLimit: number;
  monthRequests: number;
  monthlyLimit: number;
  reason?: string;

  // Internal diagnostic alias (strictly for diagnostic info, NOT blocking)
  todayEstimatedTokens: number;
  todayNeurons: number;
  hardNeuronLimit: number;
  localSafetyCap: number;
}

export interface RecordUsageParams {
  provider: string;
  model: string;
  role: string;
  inputTokens?: number;
  outputTokens?: number;
  neuronsUsed?: number;
  estimatedTokens?: number;
  success: boolean;
  durationMs?: number;
  errorMessage?: string;
  source?: 'local_estimate' | 'cloudflare_verified';
}

export interface ApplicationSafetyGuard {
  todayRequests: number;
  dailyLimit: number;
  monthRequests: number;
  monthlyLimit: number;
  status: 'FREE_CAPACITY_AVAILABLE' | 'DEFERRED_NO_FREE_AI_CAPACITY';
  provider: string;
  purpose: string;
}

export interface InternalDiagnostics {
  estimatedTokensToday: number;
  estimationMethod: string;
  disclaimer: string;
}

export interface FullUsageSummaryResponse {
  cloudflareVerifiedUsage: CloudflareVerifiedUsage;
  applicationSafetyGuard: ApplicationSafetyGuard;
  internalDiagnostics: InternalDiagnostics;

  // Backwards-compatibility top-level fields
  todayRequests: number;
  dailyLimit: number;
  todayNeurons: number;
  targetNeuronLimit: number;
  softNeuronLimit: number;
  hardNeuronLimit: number;
  budgetState: BudgetState;
  monthRequests: number;
  monthlyLimit: number;
  status: 'FREE_CAPACITY_AVAILABLE' | 'DEFERRED_NO_FREE_AI_CAPACITY';
  provider: string;
}

export class QuotaManager {
  private dailyLimit: number;
  private monthlyLimit: number;

  constructor(limits?: Partial<typeof DEFAULT_AI_LIMITS>) {
    this.dailyLimit = limits?.maxRequestsPerDay ?? DEFAULT_DAILY_REQUEST_SAFETY_LIMIT;
    this.monthlyLimit = limits?.maxRequestsPerMonth ?? DEFAULT_MONTHLY_REQUEST_SAFETY_LIMIT;
  }

  /**
   * Determine current budget state from daily request count.
   */
  static getBudgetState(todayRequests: number, dailyLimit: number = DEFAULT_DAILY_REQUEST_SAFETY_LIMIT): BudgetState {
    if (todayRequests >= dailyLimit) {
      return 'HARD_STOP';
    }
    if (todayRequests >= Math.floor(dailyLimit * 0.8)) {
      return 'RESTRICTED';
    }
    if (todayRequests >= Math.floor(dailyLimit * 0.6)) {
      return 'CONTROLLED';
    }
    return 'NORMAL';
  }

  /**
   * Check if application request safety guard capacity is available.
   * Blocks ONLY if provider is paid or daily/monthly request limits are exceeded.
   * NEVER blocks based on character-length token estimates!
   */
  async checkCapacity(
    db: D1Database,
    provider: string,
    model: string,
    _options?: { estimatedNeuronCost?: number; isExploratory?: boolean },
  ): Promise<CapacityStatus> {
    const normalizedProvider = provider.toLowerCase().trim();

    // 1. Enforce zero cost policy: Paid providers are strictly prohibited
    const isFreeProvider = ALLOWED_FREE_PROVIDERS.includes(normalizedProvider as FreeProviderName);
    if (!isFreeProvider) {
      return {
        allowed: false,
        status: 'DEFERRED_NO_FREE_AI_CAPACITY',
        budgetState: 'HARD_STOP',
        provider: normalizedProvider,
        model,
        todayRequests: 0,
        dailyLimit: this.dailyLimit,
        todayEstimatedTokens: 0,
        todayNeurons: 0,
        hardNeuronLimit: DEFAULT_DAILY_REQUEST_SAFETY_LIMIT,
        localSafetyCap: DEFAULT_DAILY_REQUEST_SAFETY_LIMIT,
        monthRequests: 0,
        monthlyLimit: this.monthlyLimit,
        reason: `Provider '${normalizedProvider}' is not a verified free AI provider. Paid AI providers are strictly prohibited.`,
      };
    }

    const todayStr = new Date().toISOString().split('T')[0] ?? '';
    const monthStr = todayStr.substring(0, 7);

    try {
      // 2. Query today's request count and estimated tokens from ai_usage
      const todayResult = await db
        .prepare(
          'SELECT SUM(request_count) as req_total, SUM(neurons_used) as neuron_total FROM ai_usage WHERE date = ?',
        )
        .bind(todayStr)
        .first<{ req_total: number | null; neuron_total: number | null }>();

      const todayRequests = todayResult?.req_total ?? 0;
      const todayEstTokens = todayResult?.neuron_total ?? 0;

      // 3. Query month's request count
      const monthResult = await db
        .prepare('SELECT SUM(request_count) as total FROM ai_usage WHERE date LIKE ?')
        .bind(`${monthStr}%`)
        .first<{ total: number | null }>();
      const monthRequests = monthResult?.total ?? 0;

      const budgetState = QuotaManager.getBudgetState(todayRequests, this.dailyLimit);

      // 4. Circuit breaker: Daily request limit reached
      if (todayRequests >= this.dailyLimit) {
        return {
          allowed: false,
          status: 'DEFERRED_NO_FREE_AI_CAPACITY',
          budgetState: 'HARD_STOP',
          provider: normalizedProvider,
          model,
          todayRequests,
          dailyLimit: this.dailyLimit,
          todayEstimatedTokens: todayEstTokens,
          todayNeurons: todayEstTokens,
          hardNeuronLimit: this.dailyLimit,
          localSafetyCap: this.dailyLimit,
          monthRequests,
          monthlyLimit: this.monthlyLimit,
          reason: `Daily free AI request limit reached (${todayRequests}/${this.dailyLimit} requests today). AI deferred by safety circuit breaker.`,
        };
      }

      // 5. Circuit breaker: Monthly request limit reached
      if (monthRequests >= this.monthlyLimit) {
        return {
          allowed: false,
          status: 'DEFERRED_NO_FREE_AI_CAPACITY',
          budgetState: 'HARD_STOP',
          provider: normalizedProvider,
          model,
          todayRequests,
          dailyLimit: this.dailyLimit,
          todayEstimatedTokens: todayEstTokens,
          todayNeurons: todayEstTokens,
          hardNeuronLimit: this.dailyLimit,
          localSafetyCap: this.dailyLimit,
          monthRequests,
          monthlyLimit: this.monthlyLimit,
          reason: `Monthly free AI request limit reached (${monthRequests}/${this.monthlyLimit} requests this month). AI deferred by safety circuit breaker.`,
        };
      }

      return {
        allowed: true,
        status: 'FREE_CAPACITY_AVAILABLE',
        budgetState,
        provider: normalizedProvider,
        model,
        todayRequests,
        dailyLimit: this.dailyLimit,
        todayEstimatedTokens: todayEstTokens,
        todayNeurons: todayEstTokens,
        hardNeuronLimit: this.dailyLimit,
        localSafetyCap: this.dailyLimit,
        monthRequests,
        monthlyLimit: this.monthlyLimit,
      };
    } catch {
      return {
        allowed: false,
        status: 'DEFERRED_NO_FREE_AI_CAPACITY',
        budgetState: 'HARD_STOP',
        provider: normalizedProvider,
        model,
        todayRequests: 0,
        dailyLimit: this.dailyLimit,
        todayEstimatedTokens: 0,
        todayNeurons: 0,
        hardNeuronLimit: this.dailyLimit,
        localSafetyCap: this.dailyLimit,
        monthRequests: 0,
        monthlyLimit: this.monthlyLimit,
        reason: 'Database error while evaluating application safety limits.',
      };
    }
  }

  /**
   * Record AI request execution and estimated tokens in D1.
   */
  async recordUsage(db: D1Database, params: RecordUsageParams): Promise<void> {
    const todayStr = new Date().toISOString().split('T')[0] ?? '';
    const id = `usage-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const inputTokens = params.inputTokens ?? 0;
    const outputTokens = params.outputTokens ?? 0;
    const totalTokens = inputTokens + outputTokens;

    // INTERNAL DIAGNOSTIC ESTIMATE ONLY (char / 4). NOT Cloudflare billing.
    const estTokens = params.estimatedTokens ?? params.neuronsUsed ?? Math.max(10, Math.ceil(totalTokens * 1.0));
    const failedIncrement = params.success ? 0 : 1;
    const dataSouce = params.source ?? 'local_estimate';

    try {
      await db
        .prepare(
          `
          INSERT INTO ai_usage (id, provider, model, role, date, request_count, input_tokens, output_tokens, failed_count, neurons_used, source)
          VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)
          ON CONFLICT(provider, model, role, date) DO UPDATE SET
            request_count = request_count + 1,
            input_tokens = input_tokens + excluded.input_tokens,
            output_tokens = output_tokens + excluded.output_tokens,
            failed_count = failed_count + excluded.failed_count,
            neurons_used = neurons_used + excluded.neurons_used,
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
          estTokens,
          dataSouce,
        )
        .run();

      const runId = `run-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      await db
        .prepare(
          `
          INSERT INTO ai_runs (id, role, model, provider, prompt_tokens, completion_tokens, total_tokens, duration_ms, status, error_message, neurons_used, source)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        )
        .bind(
          runId,
          params.role,
          params.model,
          params.provider.toLowerCase(),
          inputTokens,
          outputTokens,
          totalTokens,
          params.durationMs ?? 0,
          params.success ? 'completed' : 'failed',
          params.errorMessage || null,
          estTokens,
          dataSouce,
        )
        .run();
    } catch (err) {
      console.error('[QUOTA] Failed to record AI execution metrics in D1:', err);
    }
  }

  /**
   * Fetch aggregate summary returning Cloudflare Verified Telemetry, Application Safety Guard,
   * and Internal Diagnostics.
   */
  async getFullUsageSummary(
    db: D1Database,
    env?: Env,
    cloudflareService?: CloudflareUsageService,
  ): Promise<FullUsageSummaryResponse> {
    const todayStr = new Date().toISOString().split('T')[0] ?? '';
    const monthStr = todayStr.substring(0, 7);

    // 1. Official Cloudflare Verified Telemetry
    const service = cloudflareService || CloudflareUsageService.fromEnv(env);
    const cloudflareVerifiedUsage = await service.getVerifiedUsage();

    // 2. Application Safety Guard & Internal Diagnostics
    let todayRequests = 0;
    let estimatedTokensToday = 0;
    let monthRequests = 0;

    try {
      const todayResult = await db
        .prepare(
          'SELECT SUM(request_count) as req_total, SUM(neurons_used) as neuron_total FROM ai_usage WHERE date = ?',
        )
        .bind(todayStr)
        .first<{ req_total: number | null; neuron_total: number | null }>();

      todayRequests = todayResult?.req_total ?? 0;
      estimatedTokensToday = todayResult?.neuron_total ?? 0;

      const monthResult = await db
        .prepare('SELECT SUM(request_count) as total FROM ai_usage WHERE date LIKE ?')
        .bind(`${monthStr}%`)
        .first<{ total: number | null }>();
      monthRequests = monthResult?.total ?? 0;
    } catch {
      // Defaults
    }

    const budgetState = QuotaManager.getBudgetState(todayRequests, this.dailyLimit);
    const available =
      todayRequests < this.dailyLimit &&
      monthRequests < this.monthlyLimit;

    const applicationSafetyGuard: ApplicationSafetyGuard = {
      todayRequests,
      dailyLimit: this.dailyLimit,
      monthRequests,
      monthlyLimit: this.monthlyLimit,
      status: available ? 'FREE_CAPACITY_AVAILABLE' : 'DEFERRED_NO_FREE_AI_CAPACITY',
      provider: 'Cloudflare Workers AI',
      purpose: 'Prevents runaway AI loops (request safety circuit breaker)',
    };

    const internalDiagnostics: InternalDiagnostics = {
      estimatedTokensToday,
      estimationMethod: 'character-length heuristic (char / 4)',
      disclaimer: 'Internal application metric only. NOT Cloudflare usage.',
    };

    return {
      cloudflareVerifiedUsage,
      applicationSafetyGuard,
      internalDiagnostics,
      // Backwards-compatible aliases
      todayRequests,
      dailyLimit: this.dailyLimit,
      todayNeurons: estimatedTokensToday,
      targetNeuronLimit: 5000,
      softNeuronLimit: 6000,
      hardNeuronLimit: 7500,
      budgetState,
      monthRequests,
      monthlyLimit: this.monthlyLimit,
      status: available ? 'FREE_CAPACITY_AVAILABLE' : 'DEFERRED_NO_FREE_AI_CAPACITY',
      provider: 'Cloudflare Workers AI',
    };
  }

  async getUsageSummary(db: D1Database, env?: Env): Promise<FullUsageSummaryResponse> {
    return this.getFullUsageSummary(db, env);
  }
}
