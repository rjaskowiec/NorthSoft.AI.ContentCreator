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

export class CloudflareWorkersAIProvider implements IAIProvider {
  readonly name = 'cloudflare-workers-ai';
  private aiBinding?: { run(model: string, inputs: unknown): Promise<unknown> };
  private defaultModel: string;

  constructor(config?: CloudflareWorkersAIConfig) {
    this.aiBinding = config?.aiBinding;
    this.defaultModel = config?.defaultModel || '@cf/meta/llama-3.1-8b-instruct-fp8';
  }

  async complete(request: AICompletionRequest): Promise<AICompletionResult> {
    const startTime = Date.now();
    const model = this.defaultModel;

    if (!this.aiBinding) {
      throw new Error(
        'Cloudflare Workers AI binding (env.AI) is not configured in environment. ' +
          'Free AI inference requires Cloudflare Workers AI.',
      );
    }

    const payload = {
      messages: request.messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      max_tokens: request.maxTokens ?? 1024,
      temperature: request.temperature ?? 0.3,
    };

    try {
      const result = (await this.aiBinding.run(model, payload)) as {
        response?: string;
        choices?: Array<{ message?: { content?: string } }>;
      };

      let text = '';
      if (typeof result === 'string') {
        text = result;
      } else if (result?.response) {
        text = result.response;
      } else if (result?.choices?.[0]?.message?.content) {
        text = result.choices[0].message.content;
      } else {
        throw new Error('Cloudflare Workers AI returned empty or unparseable response format.');
      }

      const durationMs = Date.now() - startTime;
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
