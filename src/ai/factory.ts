/**
 * NorthSoft.AI.ContentCreator — AI Provider Factory
 *
 * Resolves and creates the appropriate IAIProvider instance based on environment variables / secrets.
 */

import { CloudflareWorkersAIProvider } from './cloudflare-workers-ai-provider';
import { MockAIProvider } from './mock-provider';
import type { AIRole, IAIProvider } from './provider';

/**
 * Resolves and creates the appropriate free IAIProvider instance.
 *
 * ZERO-COST AI POLICY:
 * Paid AI providers (OpenAI, Anthropic, etc.) are strictly prohibited.
 * Primary provider: Cloudflare Workers AI (env.AI binding).
 * Fallback in test/local dev: MockAIProvider.
 */
export function getAIProvider(env: Env, role: AIRole = 'researcher'): IAIProvider {
  let providerName = 'cloudflare-workers-ai';

  if (role === 'researcher') {
    providerName = env.AI_RESEARCH_PROVIDER || env.AI_PROVIDER || 'cloudflare-workers-ai';
  } else if (role === 'writer') {
    providerName = env.AI_WRITER_PROVIDER || env.AI_PROVIDER || 'cloudflare-workers-ai';
  } else if (role === 'qa') {
    providerName = env.AI_QA_PROVIDER || env.AI_PROVIDER || 'cloudflare-workers-ai';
  } else if (role === 'policy') {
    providerName = env.AI_POLICY_PROVIDER || env.AI_PROVIDER || 'cloudflare-workers-ai';
  }

  providerName = providerName.toLowerCase().trim();

  // Primary free provider: Cloudflare Workers AI binding
  if (providerName === 'cloudflare-workers-ai') {
    if (env.AI) {
      const model = env.AI_RESEARCH_MODEL || '@cf/meta/llama-3.1-8b-instruct';
      return new CloudflareWorkersAIProvider({
        aiBinding: env.AI,
        defaultModel: model,
      });
    }

    // In production or staging, missing env.AI binding is a configuration error
    if (env.ENVIRONMENT === 'production' || env.ENVIRONMENT === 'staging') {
      throw new Error(
        `Cloudflare Workers AI binding (env.AI) is missing in ${env.ENVIRONMENT} environment. ` +
          `Free AI inference requires Cloudflare Workers AI. Check wrangler configuration.`,
      );
    }
  }

  // Fallback to MockAIProvider ONLY in test/development environment
  return new MockAIProvider();
}
