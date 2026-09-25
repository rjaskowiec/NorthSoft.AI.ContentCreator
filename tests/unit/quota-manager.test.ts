import { describe, expect, it, vi } from 'vitest';
import { QuotaManager, MAX_ALLOWED_AI_COST } from '../../src/services/ai/quota-manager';
import { getAIProvider } from '../../src/ai/factory';

describe('QuotaManager — Zero-Cost AI Policy Enforcement', () => {
  it('enforces MAX_ALLOWED_AI_COST = 0 constant', () => {
    expect(MAX_ALLOWED_AI_COST).toBe(0);
  });

  it('rejects paid AI providers with allowed=false and DEFERRED status', async () => {
    const mockDb = { prepare: vi.fn() } as unknown as D1Database;
    const manager = new QuotaManager();

    const paidProviders = ['openai', 'anthropic', 'google', 'openrouter', 'cohere'];

    for (const provider of paidProviders) {
      const res = await manager.checkCapacity(mockDb, provider, 'gpt-4o');
      expect(res.allowed).toBe(false);
      expect(res.status).toBe('DEFERRED_NO_FREE_AI_CAPACITY');
      expect(res.reason).toContain('not a verified free AI provider');
    }
  });

  it('allows verified free provider (cloudflare-workers-ai) when under limits', async () => {
    const mockDb = {
      prepare: vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue({ total: 5 }), // 5 requests today
        }),
      }),
    } as unknown as D1Database;

    const manager = new QuotaManager({ maxRequestsPerDay: 50, maxRequestsPerMonth: 1000 });
    const res = await manager.checkCapacity(
      mockDb,
      'cloudflare-workers-ai',
      '@cf/meta/llama-3.1-8b-instruct',
    );

    expect(res.allowed).toBe(true);
    expect(res.status).toBe('FREE_CAPACITY_AVAILABLE');
    expect(res.provider).toBe('cloudflare-workers-ai');
  });

  it('defers request when daily request limit is reached', async () => {
    const mockDb = {
      prepare: vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue({ total: 50 }), // 50 requests today = limit reached
        }),
      }),
    } as unknown as D1Database;

    const manager = new QuotaManager({ maxRequestsPerDay: 50, maxRequestsPerMonth: 1000 });
    const res = await manager.checkCapacity(mockDb, 'cloudflare-workers-ai', 'default');

    expect(res.allowed).toBe(false);
    expect(res.status).toBe('DEFERRED_NO_FREE_AI_CAPACITY');
    expect(res.reason).toContain('Daily free AI limit reached');
  });

  it('defers request when monthly request limit is reached', async () => {
    let callCount = 0;
    const mockDb = {
      prepare: vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockImplementation(() => {
            callCount++;
            if (callCount === 1) return Promise.resolve({ total: 10 }); // Today: 10
            return Promise.resolve({ total: 1000 }); // Month: 1000 (limit)
          }),
        }),
      }),
    } as unknown as D1Database;

    const manager = new QuotaManager({ maxRequestsPerDay: 50, maxRequestsPerMonth: 1000 });
    const res = await manager.checkCapacity(mockDb, 'mock', 'default');

    expect(res.allowed).toBe(false);
    expect(res.status).toBe('DEFERRED_NO_FREE_AI_CAPACITY');
    expect(res.reason).toContain('Monthly free AI limit reached');
  });

  it('records AI usage into D1 ai_usage and ai_runs tables', async () => {
    const runMock = vi.fn().mockResolvedValue({ success: true });
    const mockDb = {
      prepare: vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({
          run: runMock,
        }),
      }),
    } as unknown as D1Database;

    const manager = new QuotaManager();
    await manager.recordUsage(mockDb, {
      provider: 'cloudflare-workers-ai',
      model: '@cf/meta/llama-3.1-8b-instruct',
      role: 'researcher',
      inputTokens: 120,
      outputTokens: 250,
      success: true,
      durationMs: 450,
    });

    expect(mockDb.prepare).toHaveBeenCalledTimes(2);
    expect(runMock).toHaveBeenCalledTimes(2);
  });
});

describe('AI Provider Factory — Zero Paid Fallback Policy', () => {
  it('returns MockAIProvider in development when no env.AI is provided', () => {
    const env = { ENVIRONMENT: 'development' } as unknown as Env;
    const provider = getAIProvider(env, 'researcher');
    expect(provider.name).toBe('mock');
  });

  it('returns CloudflareWorkersAIProvider when env.AI binding is available', () => {
    const env = {
      ENVIRONMENT: 'production',
      AI: { run: vi.fn() },
    } as unknown as Env;

    const provider = getAIProvider(env, 'researcher');
    expect(provider.name).toBe('cloudflare-workers-ai');
  });

  it('never falls back to OpenAI or paid provider', () => {
    const env = {
      ENVIRONMENT: 'production',
      OPENAI_API_KEY: 'sk-proj-malicious-key',
    } as unknown as Env;

    const provider = getAIProvider(env, 'researcher');
    expect(provider.name).toBe('mock');
    expect(provider.name).not.toBe('openai');
  });
});
