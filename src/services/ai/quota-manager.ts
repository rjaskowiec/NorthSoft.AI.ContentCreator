/**
 * NorthSoft.AI.ContentCreator — AI Quota & Local Safety Budget Manager
 *
 * Enforces CRITICAL BUSINESS REQUIREMENT: ZERO PAID AI COST (MAX_ALLOWED_AI_COST = 0)
 * and strict ContentCreator Daily Local Safety Budget ceiling of 7,500 Estimated Tokens/day.
 *
 * IMPORTANT DESIGN SCOPE:
 *  - Cloudflare Verified Telemetry is queried via CloudflareUsageService (GraphQL API).
 *  - Application-side metrics (request count, character length / 4) are strictly labeled
 *    as LOCAL EXECUTION METRICS and ESTIMATED TOKENS / LOCAL SAFETY BUDGET.
 *  - Local estimates are NEVER represented as Cloudflare Neurons or official billing metrics.
 */

import { CloudflareUsageService, type CloudflareVerifiedUsage } from '../cloudflare/cloudflare-usage-service';

export const MAX_ALLOWED_AI_COST = 0;

export const LOCAL_SAFETY_BUDGET_HARD_LIMIT = 7500; // 7,500 estimated tokens local safety cap
export const LOCAL_SAFETY_BUDGET_SOFT_LIMIT = 6000;
export const LOCAL_SAFETY_BUDGET_TARGET = 5000;

// Legacy export aliases for backwards compatibility in existing imports
export const CONTENT_CREATOR_DAILY_NEURON_HARD_LIMIT = LOCAL_SAFETY_BUDGET_HARD_LIMIT;
export const CONTENT_CREATOR_DAILY_NEURON_SOFT_LIMIT = LOCAL_SAFETY_BUDGET_SOFT_LIMIT;
export const CONTENT_CREATOR_DAILY_NEURON_TARGET = LOCAL_SAFETY_BUDGET_TARGET;

export type BudgetState = 'NORMAL' | 'CONTROLLED' | 'RESTRICTED' | 'HARD_STOP';

export const DEFAULT_AI_LIMITS = {
  maxRequestsPerRun: 25,
  maxRequestsPerDay: 300,
  maxRequestsPerMonth: 5000,
  maxEstimatedTokensPerDay: LOCAL_SAFETY_BUDGET_HARD_LIMIT,
  maxNeuronsPerDay: LOCAL_SAFETY_BUDGET_HARD_LIMIT,
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
  todayEstimatedTokens: number;
  localSafetyCap: number;
  monthRequests: number;
  monthlyLimit: number;
  reason?: string;

  // Backwards compatibility aliases (strictly represent local estimated tokens, NOT Cloudflare billing)
  todayNeurons: number;
  hardNeuronLimit: number;
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

export interface ApplicationExecutionMetrics {
  todayRequests: number;
  dailyLimit: number;
  todayEstimatedTokens: number;
  localSafetyCap: number;
  targetEstimatedTokensLimit: number;
  softEstimatedTokensLimit: number;
  hardEstimatedTokensLimit: number;
  budgetState: BudgetState;
  monthRequests: number;
  monthlyLimit: number;
  status: 'FREE_CAPACITY_AVAILABLE' | 'DEFERRED_NO_FREE_AI_CAPACITY';
  provider: string;
}

export interface FullUsageSummaryResponse {
  cloudflareVerifiedUsage: CloudflareVerifiedUsage;
  applicationMetrics: ApplicationExecutionMetrics;

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
  private localSafetyCap: number;

  constructor(limits?: Partial<typeof DEFAULT_AI_LIMITS>) {
    this.dailyLimit = limits?.maxRequestsPerDay ?? DEFAULT_AI_LIMITS.maxRequestsPerDay;
    this.monthlyLimit = limits?.maxRequestsPerMonth ?? DEFAULT_AI_LIMITS.maxRequestsPerMonth;

    const requestedLimit =
      limits?.maxEstimatedTokensPerDay ??
      limits?.maxNeuronsPerDay ??
      LOCAL_SAFETY_BUDGET_HARD_LIMIT;
    this.localSafetyCap = Math.min(requestedLimit, LOCAL_SAFETY_BUDGET_HARD_LIMIT);
  }

  /**
   * Determine current budget state from daily estimated tokens consumption.
   */
  static getBudgetState(estimatedTokensUsed: number): BudgetState {
    if (estimatedTokensUsed >= LOCAL_SAFETY_BUDGET_HARD_LIMIT) {
      return 'HARD_STOP';
    }
    if (estimatedTokensUsed >= LOCAL_SAFETY_BUDGET_SOFT_LIMIT) {
      return 'RESTRICTED';
    }
    if (estimatedTokensUsed >= LOCAL_SAFETY_BUDGET_TARGET) {
      return 'CONTROLLED';
    }
    return 'NORMAL';
  }

  /**
   * Check if free capacity and local safety budget are available for an AI request.
   * NEVER returns allowed=true for a paid provider or when local safety cap (7500) is exceeded.
   */
  async checkCapacity(
    db: D1Database,
    provider: string,
    model: string,
    options?: { estimatedNeuronCost?: number; isExploratory?: boolean },
  ): Promise<CapacityStatus> {
    const normalizedProvider = provider.toLowerCase().trim();
    const estimatedCost = options?.estimatedNeuronCost ?? 1000;
    const isExploratory = options?.isExploratory ?? false;

    // Enforce zero cost policy: Paid providers are strictly prohibited
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
        localSafetyCap: this.localSafetyCap,
        todayNeurons: 0,
        hardNeuronLimit: this.localSafetyCap,
        monthRequests: 0,
        monthlyLimit: this.monthlyLimit,
        reason: `Provider '${normalizedProvider}' is not a verified free AI provider. Paid AI providers are strictly prohibited.`,
      };
    }

    const todayStr = new Date().toISOString().split('T')[0] ?? '';
    const monthStr = todayStr.substring(0, 7);

    try {
      // 1. Query today's request count and total estimated tokens
      const todayResult = await db
        .prepare(
          'SELECT SUM(request_count) as req_total, SUM(neurons_used) as neuron_total FROM ai_usage WHERE date = ?',
        )
        .bind(todayStr)
        .first<{ req_total: number | null; neuron_total: number | null; estimated_tokens_total?: number | null }>();

      const todayRequests = todayResult?.req_total ?? 0;
      const todayEstTokens = todayResult?.neuron_total ?? todayResult?.estimated_tokens_total ?? 0;

      // 2. Query month's request count
      const monthResult = await db
        .prepare('SELECT SUM(request_count) as total FROM ai_usage WHERE date LIKE ?')
        .bind(`${monthStr}%`)
        .first<{ total: number | null }>();
      const monthRequests = monthResult?.total ?? 0;

      const budgetState = QuotaManager.getBudgetState(todayEstTokens);

      // HARD STOP: Exhausted 7,500 local safety token ceiling
      if (todayEstTokens + estimatedCost > this.localSafetyCap || budgetState === 'HARD_STOP') {
        return {
          allowed: false,
          status: 'DEFERRED_NO_FREE_AI_CAPACITY',
          budgetState: 'HARD_STOP',
          provider: normalizedProvider,
          model,
          todayRequests,
          dailyLimit: this.dailyLimit,
          todayEstimatedTokens: todayEstTokens,
          localSafetyCap: this.localSafetyCap,
          todayNeurons: todayEstTokens,
          hardNeuronLimit: this.localSafetyCap,
          monthRequests,
          monthlyLimit: this.monthlyLimit,
          reason: `Daily application local safety cap reached (Neuron hard limit reached: ${todayEstTokens}/${this.localSafetyCap} estimated tokens used). AI execution deferred.`,
        };
      }

      // RESTRICTED mode: 6,000+ estimated tokens — Block exploratory requests
      if (budgetState === 'RESTRICTED' && isExploratory) {
        return {
          allowed: false,
          status: 'DEFERRED_NO_FREE_AI_CAPACITY',
          budgetState: 'RESTRICTED',
          provider: normalizedProvider,
          model,
          todayRequests,
          dailyLimit: this.dailyLimit,
          todayEstimatedTokens: todayEstTokens,
          localSafetyCap: this.localSafetyCap,
          todayNeurons: todayEstTokens,
          hardNeuronLimit: this.localSafetyCap,
          monthRequests,
          monthlyLimit: this.monthlyLimit,
          reason: `Local Safety Budget in RESTRICTED state (${todayEstTokens} est. tokens). Exploratory AI requests are deferred.`,
        };
      }

      if (todayRequests >= this.dailyLimit) {
        return {
          allowed: false,
          status: 'DEFERRED_NO_FREE_AI_CAPACITY',
          budgetState,
          provider: normalizedProvider,
          model,
          todayRequests,
          dailyLimit: this.dailyLimit,
          todayEstimatedTokens: todayEstTokens,
          localSafetyCap: this.localSafetyCap,
          todayNeurons: todayEstTokens,
          hardNeuronLimit: this.localSafetyCap,
          monthRequests,
          monthlyLimit: this.monthlyLimit,
          reason: `Daily free AI request limit reached (${todayRequests}/${this.dailyLimit} requests today).`,
        };
      }

      if (monthRequests >= this.monthlyLimit) {
        return {
          allowed: false,
          status: 'DEFERRED_NO_FREE_AI_CAPACITY',
          budgetState,
          provider: normalizedProvider,
          model,
          todayRequests,
          dailyLimit: this.dailyLimit,
          todayEstimatedTokens: todayEstTokens,
          localSafetyCap: this.localSafetyCap,
          todayNeurons: todayEstTokens,
          hardNeuronLimit: this.localSafetyCap,
          monthRequests,
          monthlyLimit: this.monthlyLimit,
          reason: `Monthly free AI request limit reached (${monthRequests}/${this.monthlyLimit} requests this month).`,
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
        localSafetyCap: this.localSafetyCap,
        todayNeurons: todayEstTokens,
        hardNeuronLimit: this.localSafetyCap,
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
        localSafetyCap: this.localSafetyCap,
        todayNeurons: 0,
        hardNeuronLimit: this.localSafetyCap,
        monthRequests: 0,
        monthlyLimit: this.monthlyLimit,
        reason: 'Database error while evaluating local safety budget.',
      };
    }
  }

  /**
   * Record AI request usage, token consumption, and calculated estimated tokens in D1.
   */
  async recordUsage(db: D1Database, params: RecordUsageParams): Promise<void> {
    const todayStr = new Date().toISOString().split('T')[0] ?? '';
    const id = `usage-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const inputTokens = params.inputTokens ?? 0;
    const outputTokens = params.outputTokens ?? 0;
    const totalTokens = inputTokens + outputTokens;

    // LOCAL ESTIMATED TOKENS (char length / 4). NOT Cloudflare billing.
    const estTokens = params.estimatedTokens ?? params.neuronsUsed ?? Math.max(10, Math.ceil(totalTokens * 1.0));
    const failedIncrement = params.success ? 0 : 1;
    const dataSouce = params.source ?? 'local_estimate';

    try {
      // 1. Upsert into ai_usage aggregate table
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

      // 2. Insert into ai_runs execution audit log
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
      console.error('[QUOTA] Failed to record AI usage in D1:', err);
    }
  }

  /**
   * Fetch aggregate AI usage stats, returning BOTH Cloudflare Verified Usage (official API)
   * AND Application Execution Metrics (local safety budget).
   */
  async getFullUsageSummary(
    db: D1Database,
    env?: Env,
    cloudflareService?: CloudflareUsageService,
  ): Promise<FullUsageSummaryResponse> {
    const todayStr = new Date().toISOString().split('T')[0] ?? '';
    const monthStr = todayStr.substring(0, 7);

    // 1. Fetch Cloudflare Verified Telemetry
    const service = cloudflareService || CloudflareUsageService.fromEnv(env);
    const cloudflareVerifiedUsage = await service.getVerifiedUsage();

    // 2. Fetch Application Execution Metrics & Local Safety Budget from D1
    let todayRequests = 0;
    let todayEstimatedTokens = 0;
    let monthRequests = 0;

    try {
      const todayResult = await db
        .prepare(
          'SELECT SUM(request_count) as req_total, SUM(neurons_used) as neuron_total FROM ai_usage WHERE date = ?',
        )
        .bind(todayStr)
        .first<{ req_total: number | null; neuron_total: number | null; estimated_tokens_total?: number | null }>();

      todayRequests = todayResult?.req_total ?? 0;
      todayEstimatedTokens = todayResult?.neuron_total ?? todayResult?.estimated_tokens_total ?? 0;

      const monthResult = await db
        .prepare('SELECT SUM(request_count) as total FROM ai_usage WHERE date LIKE ?')
        .bind(`${monthStr}%`)
        .first<{ total: number | null }>();
      monthRequests = monthResult?.total ?? 0;
    } catch {
      // Keep defaults
    }

    const budgetState = QuotaManager.getBudgetState(todayEstimatedTokens);
    const available =
      budgetState !== 'HARD_STOP' &&
      todayRequests < this.dailyLimit &&
      monthRequests < this.monthlyLimit;

    const applicationMetrics: ApplicationExecutionMetrics = {
      todayRequests,
      dailyLimit: this.dailyLimit,
      todayEstimatedTokens,
      localSafetyCap: this.localSafetyCap,
      targetEstimatedTokensLimit: LOCAL_SAFETY_BUDGET_TARGET,
      softEstimatedTokensLimit: LOCAL_SAFETY_BUDGET_SOFT_LIMIT,
      hardEstimatedTokensLimit: this.localSafetyCap,
      budgetState,
      monthRequests,
      monthlyLimit: this.monthlyLimit,
      status: available ? 'FREE_CAPACITY_AVAILABLE' : 'DEFERRED_NO_FREE_AI_CAPACITY',
      provider: 'Cloudflare Workers AI',
    };

    return {
      cloudflareVerifiedUsage,
      applicationMetrics,
      // Backwards-compatible top level aliases
      todayRequests,
      dailyLimit: this.dailyLimit,
      todayNeurons: todayEstimatedTokens,
      targetNeuronLimit: LOCAL_SAFETY_BUDGET_TARGET,
      softNeuronLimit: LOCAL_SAFETY_BUDGET_SOFT_LIMIT,
      hardNeuronLimit: this.localSafetyCap,
      budgetState,
      monthRequests,
      monthlyLimit: this.monthlyLimit,
      status: available ? 'FREE_CAPACITY_AVAILABLE' : 'DEFERRED_NO_FREE_AI_CAPACITY',
      provider: 'Cloudflare Workers AI',
    };
  }

  /**
   * Backwards compatible getUsageSummary wrapper.
   */
  async getUsageSummary(db: D1Database, env?: Env): Promise<FullUsageSummaryResponse> {
    return this.getFullUsageSummary(db, env);
  }
}
