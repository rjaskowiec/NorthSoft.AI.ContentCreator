/**
 * NorthSoft.AI.ContentCreator — AI Quota & Neuron Budget Manager
 *
 * Enforces CRITICAL BUSINESS REQUIREMENT: ZERO PAID AI COST (MAX_ALLOWED_AI_COST = 0)
 * and strict ContentCreator Daily Neuron Budget ceiling of 7,500 Neurons/day.
 *
 * Budget Tiers (Shared 10,000 Neurons/day Workers AI Allocation):
 *  - 0 – 5,000 Neurons: NORMAL mode (standard research & draft generation)
 *  - 5,000 – 6,000 Neurons: CONTROLLED mode (reduce optional AI ops, prioritize existing work)
 *  - 6,000 – 7,500 Neurons: RESTRICTED mode (only high-priority tasks, no retries/exploratory)
 *  - >= 7,500 Neurons: HARD STOP mode (absolute ceiling, DEFERRED_NO_FREE_AI_CAPACITY)
 */

export const MAX_ALLOWED_AI_COST = 0;

export const CONTENT_CREATOR_DAILY_NEURON_HARD_LIMIT = 7500;
export const CONTENT_CREATOR_DAILY_NEURON_SOFT_LIMIT = 6000;
export const CONTENT_CREATOR_DAILY_NEURON_TARGET = 5000;

export type BudgetState = 'NORMAL' | 'CONTROLLED' | 'RESTRICTED' | 'HARD_STOP';

export const DEFAULT_AI_LIMITS = {
  maxRequestsPerRun: 25,
  maxRequestsPerDay: 300,
  maxRequestsPerMonth: 5000,
  maxNeuronsPerDay: CONTENT_CREATOR_DAILY_NEURON_HARD_LIMIT,
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
  todayNeurons: number;
  hardNeuronLimit: number;
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
  neuronsUsed?: number;
  success: boolean;
  durationMs?: number;
  errorMessage?: string;
}

export class QuotaManager {
  private dailyLimit: number;
  private monthlyLimit: number;
  private hardNeuronLimit: number;

  constructor(limits?: Partial<typeof DEFAULT_AI_LIMITS>) {
    this.dailyLimit = limits?.maxRequestsPerDay ?? DEFAULT_AI_LIMITS.maxRequestsPerDay;
    this.monthlyLimit = limits?.maxRequestsPerMonth ?? DEFAULT_AI_LIMITS.maxRequestsPerMonth;

    // Hard limit must NEVER exceed absolute ceiling of 7,500 Neurons/day
    const requestedNeuronLimit =
      limits?.maxNeuronsPerDay ?? CONTENT_CREATOR_DAILY_NEURON_HARD_LIMIT;
    this.hardNeuronLimit = Math.min(requestedNeuronLimit, CONTENT_CREATOR_DAILY_NEURON_HARD_LIMIT);
  }

  /**
   * Determine current budget state from daily neuron consumption.
   */
  static getBudgetState(neuronsUsed: number): BudgetState {
    if (neuronsUsed >= CONTENT_CREATOR_DAILY_NEURON_HARD_LIMIT) {
      return 'HARD_STOP';
    }
    if (neuronsUsed >= CONTENT_CREATOR_DAILY_NEURON_SOFT_LIMIT) {
      return 'RESTRICTED';
    }
    if (neuronsUsed >= CONTENT_CREATOR_DAILY_NEURON_TARGET) {
      return 'CONTROLLED';
    }
    return 'NORMAL';
  }

  /**
   * Check if free capacity and neuron budget are available for an AI request.
   * NEVER returns allowed=true for a paid provider or when hard limit (7500) is exceeded.
   */
  async checkCapacity(
    db: D1Database,
    provider: string,
    model: string,
    options?: { estimatedNeuronCost?: number; isExploratory?: boolean },
  ): Promise<CapacityStatus> {
    const normalizedProvider = provider.toLowerCase().trim();
    const estimatedNeurons = options?.estimatedNeuronCost ?? 1000;
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
        todayNeurons: 0,
        hardNeuronLimit: this.hardNeuronLimit,
        monthRequests: 0,
        monthlyLimit: this.monthlyLimit,
        reason: `Provider '${normalizedProvider}' is not a verified free AI provider. Paid AI providers are strictly prohibited.`,
      };
    }

    const todayStr = new Date().toISOString().split('T')[0] ?? '';
    const monthStr = todayStr.substring(0, 7);

    try {
      // 1. Query today's request count and total neurons used
      const todayResult = await db
        .prepare(
          'SELECT SUM(request_count) as req_total, SUM(neurons_used) as neuron_total FROM ai_usage WHERE date = ?',
        )
        .bind(todayStr)
        .first<{ req_total: number | null; neuron_total: number | null }>();

      const todayRequests = todayResult?.req_total ?? 0;
      const todayNeurons = todayResult?.neuron_total ?? 0;

      // 2. Query month's request count
      const monthResult = await db
        .prepare('SELECT SUM(request_count) as total FROM ai_usage WHERE date LIKE ?')
        .bind(`${monthStr}%`)
        .first<{ total: number | null }>();
      const monthRequests = monthResult?.total ?? 0;

      const budgetState = QuotaManager.getBudgetState(todayNeurons);

      // HARD STOP: Exhausted 7,500 Neurons ceiling or hard limit
      if (todayNeurons + estimatedNeurons > this.hardNeuronLimit || budgetState === 'HARD_STOP') {
        return {
          allowed: false,
          status: 'DEFERRED_NO_FREE_AI_CAPACITY',
          budgetState: 'HARD_STOP',
          provider: normalizedProvider,
          model,
          todayRequests,
          dailyLimit: this.dailyLimit,
          todayNeurons,
          hardNeuronLimit: this.hardNeuronLimit,
          monthRequests,
          monthlyLimit: this.monthlyLimit,
          reason: `Daily ContentCreator Neuron hard limit reached (${todayNeurons}/${this.hardNeuronLimit} neurons used). AI deferred.`,
        };
      }

      // RESTRICTED mode: 6,000+ Neurons — Block exploratory or non-critical requests
      if (budgetState === 'RESTRICTED' && isExploratory) {
        return {
          allowed: false,
          status: 'DEFERRED_NO_FREE_AI_CAPACITY',
          budgetState: 'RESTRICTED',
          provider: normalizedProvider,
          model,
          todayRequests,
          dailyLimit: this.dailyLimit,
          todayNeurons,
          hardNeuronLimit: this.hardNeuronLimit,
          monthRequests,
          monthlyLimit: this.monthlyLimit,
          reason: `Budget in RESTRICTED state (${todayNeurons} neurons used). Exploratory AI requests are deferred.`,
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
          todayNeurons,
          hardNeuronLimit: this.hardNeuronLimit,
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
          todayNeurons,
          hardNeuronLimit: this.hardNeuronLimit,
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
        todayNeurons,
        hardNeuronLimit: this.hardNeuronLimit,
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
        todayNeurons: 0,
        hardNeuronLimit: this.hardNeuronLimit,
        monthRequests: 0,
        monthlyLimit: this.monthlyLimit,
        reason: 'Database error while evaluating AI neuron quota.',
      };
    }
  }

  /**
   * Record AI request usage, token consumption, and calculated neuron usage in D1.
   */
  async recordUsage(db: D1Database, params: RecordUsageParams): Promise<void> {
    const todayStr = new Date().toISOString().split('T')[0] ?? '';
    const id = `usage-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const inputTokens = params.inputTokens ?? 0;
    const outputTokens = params.outputTokens ?? 0;
    const totalTokens = inputTokens + outputTokens;

    // ESTIMATED neurons — Cloudflare Workers AI does not return neuron counts in responses.
    // This is a local heuristic (1 estimated-token ≈ 1 neuron for 8B LLM). NOT verified usage.
    const neuronsUsed = params.neuronsUsed ?? Math.max(10, Math.ceil(totalTokens * 1.0));
    const failedIncrement = params.success ? 0 : 1;

    try {
      // 1. Upsert into ai_usage aggregate table
      await db
        .prepare(
          `
          INSERT INTO ai_usage (id, provider, model, role, date, request_count, input_tokens, output_tokens, failed_count, neurons_used)
          VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?)
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
          neuronsUsed,
        )
        .run();

      // 2. Insert into ai_runs execution audit log
      const runId = `run-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      await db
        .prepare(
          `
          INSERT INTO ai_runs (id, role, model, provider, prompt_tokens, completion_tokens, total_tokens, duration_ms, status, error_message, neurons_used)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
          neuronsUsed,
        )
        .run();
    } catch (err) {
      console.error('[QUOTA] Failed to record AI neuron usage in D1:', err);
    }
  }

  /**
   * Fetch aggregate AI neuron and request usage stats for admin reporting.
   */
  async getUsageSummary(db: D1Database): Promise<{
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
  }> {
    const todayStr = new Date().toISOString().split('T')[0] ?? '';
    const monthStr = todayStr.substring(0, 7);

    try {
      const todayResult = await db
        .prepare(
          'SELECT SUM(request_count) as req_total, SUM(neurons_used) as neuron_total FROM ai_usage WHERE date = ?',
        )
        .bind(todayStr)
        .first<{ req_total: number | null; neuron_total: number | null }>();

      const todayRequests = todayResult?.req_total ?? 0;
      const todayNeurons = todayResult?.neuron_total ?? 0;

      const monthResult = await db
        .prepare('SELECT SUM(request_count) as total FROM ai_usage WHERE date LIKE ?')
        .bind(`${monthStr}%`)
        .first<{ total: number | null }>();
      const monthRequests = monthResult?.total ?? 0;

      const budgetState = QuotaManager.getBudgetState(todayNeurons);
      const available =
        budgetState !== 'HARD_STOP' &&
        todayRequests < this.dailyLimit &&
        monthRequests < this.monthlyLimit;

      return {
        todayRequests,
        dailyLimit: this.dailyLimit,
        todayNeurons,
        targetNeuronLimit: CONTENT_CREATOR_DAILY_NEURON_TARGET,
        softNeuronLimit: CONTENT_CREATOR_DAILY_NEURON_SOFT_LIMIT,
        hardNeuronLimit: this.hardNeuronLimit,
        budgetState,
        monthRequests,
        monthlyLimit: this.monthlyLimit,
        status: available ? 'FREE_CAPACITY_AVAILABLE' : 'DEFERRED_NO_FREE_AI_CAPACITY',
        provider: 'Cloudflare Workers AI',
      };
    } catch {
      return {
        todayRequests: 0,
        dailyLimit: this.dailyLimit,
        todayNeurons: 0,
        targetNeuronLimit: CONTENT_CREATOR_DAILY_NEURON_TARGET,
        softNeuronLimit: CONTENT_CREATOR_DAILY_NEURON_SOFT_LIMIT,
        hardNeuronLimit: this.hardNeuronLimit,
        budgetState: 'NORMAL',
        monthRequests: 0,
        monthlyLimit: this.monthlyLimit,
        status: 'FREE_CAPACITY_AVAILABLE',
        provider: 'Cloudflare Workers AI',
      };
    }
  }
}
