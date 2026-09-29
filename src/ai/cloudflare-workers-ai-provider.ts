/**
 * NorthSoft.AI.ContentCreator — Cloudflare Workers AI Provider
 *
 * Implements IAIProvider using Cloudflare Workers AI native binding (`env.AI`).
 * Runs models such as `@cf/meta/llama-3.1-8b-instruct` within the Cloudflare Free Allocation
 * (10,000 free Neurons/day). Zero inference cost.
 */

import type { AICompletionRequest, AICompletionResult, IAIProvider } from './provider';

export interface CloudflareWorkersAIConfig {
  aiBinding?: { run(model: string, inputs: unknown): Promise<unknown> };
  defaultModel?: string;
}

const JSON_MODE_SUPPORTED_MODELS = new Set([
  '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
  '@hf/nousresearch/hermes-2-pro-mistral-7b',
  '@hf/thebloke/deepseek-coder-6.7b-instruct-awq',
  '@cf/deepseek-ai/deepseek-r1-distill-qwen-32b',
]);

// The previous 3.1 model alias was retired by Cloudflare. This model is listed
// by Cloudflare as supporting JSON mode and remains available in the catalog.
const JSON_MODE_FALLBACK_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';

const DEPRECATED_MODEL_ALIASES = new Map([
  ['@cf/meta/infire-llama-3.1-8b-instruct', '@cf/meta/llama-3.1-8b-instruct-fp8'],
  ['@cf/meta/llama-3.1-8b-instruct', '@cf/meta/llama-3.1-8b-instruct-fp8'],
]);

export function resolveWorkersAIModel(model: string): string {
  const normalized = model.trim();
  return DEPRECATED_MODEL_ALIASES.get(normalized) || normalized;
}

export class CloudflareWorkersAIProvider implements IAIProvider {
  readonly name = 'cloudflare-workers-ai';
  private aiBinding?: { run(model: string, inputs: unknown): Promise<unknown> };
  private defaultModel: string;

  constructor(config?: CloudflareWorkersAIConfig) {
    this.aiBinding = config?.aiBinding;
    this.defaultModel = resolveWorkersAIModel(config?.defaultModel || '@cf/meta/llama-3.1-8b-instruct-fp8');
  }

  async complete(request: AICompletionRequest): Promise<AICompletionResult> {
    const startTime = Date.now();
    // JSON mode is only supported by specific Workers AI models. The configured
    // default may be the FP8 variant, which is not on Cloudflare's JSON-mode list.
    const model =
      request.responseFormat === 'json' && !JSON_MODE_SUPPORTED_MODELS.has(this.defaultModel)
        ? JSON_MODE_FALLBACK_MODEL
        : this.defaultModel;

    if (!this.aiBinding) {
      throw new Error(
        'Cloudflare Workers AI binding (env.AI) is not configured in environment. ' +
          'Free AI inference requires Cloudflare Workers AI.',
      );
    }

    const payload: Record<string, unknown> = {
      messages: request.messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      max_tokens: request.maxTokens ?? 1024,
      temperature: request.temperature ?? 0.3,
    };

    // Workers AI supports JSON mode for the configured Llama 3.1 model. Forward
    // the caller's structured-output request instead of relying on prompt text alone.
    if (request.responseFormat === 'json') {
      payload.response_format = { type: 'json_object' };
    }

    try {
      const result = (await this.aiBinding.run(model, payload)) as {
        response?: unknown;
        choices?: Array<{ message?: { content?: unknown } }>;
      };

      let text = '';
      if (typeof result === 'string') {
        text = result;
      } else if (typeof result?.response === 'string') {
        text = result.response;
      } else if (result?.response && typeof result.response === 'object') {
        // JSON mode can return the structured value directly in `response`.
        text = JSON.stringify(result.response);
      } else if (typeof result?.choices?.[0]?.message?.content === 'string') {
        text = result.choices[0].message.content;
      } else {
        throw new Error('Cloudflare Workers AI returned empty or unparseable response format.');
      }

      const durationMs = Date.now() - startTime;
      // IMPORTANT: Cloudflare Workers AI does NOT return token counts or neuron usage
      // in inference responses. These are rough CHARACTER-BASED ESTIMATES (chars / 4).
      // They are NOT real token counts and NOT Cloudflare-verified neuron consumption.
      const promptTokens = Math.ceil(JSON.stringify(request.messages).length / 4);
      const completionTokens = Math.ceil(text.length / 4);

      return {
        content: text,
        model,
        provider: this.name,
        usage: {
          promptTokens,
          completionTokens,
          totalTokens: promptTokens + completionTokens,
        },
        finishReason: 'stop',
        durationMs,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Cloudflare Workers AI completion error: ${msg}`, { cause: err });
    }
  }

  async healthCheck(): Promise<boolean> {
    return Boolean(this.aiBinding);
  }
}
