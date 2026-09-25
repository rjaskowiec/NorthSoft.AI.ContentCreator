/**
 * NorthSoft.AI.ContentCreator — OpenAI AI Provider Implementation
 *
 * Implements IAIProvider using Workers-native fetch calls to the OpenAI REST API.
 * Supports structured JSON outputs, usage tracking, and latency metrics.
 */

import type { AICompletionRequest, AICompletionResult, IAIProvider } from './provider';

export interface OpenAIProviderConfig {
  apiKey: string;
  defaultModel?: string;
  baseUrl?: string;
  timeoutMs?: number;
}

export class OpenAIProvider implements IAIProvider {
  readonly name = 'openai';
  private apiKey: string;
  private defaultModel: string;
  private baseUrl: string;
  private timeoutMs: number;

  constructor(config: OpenAIProviderConfig) {
    if (!config.apiKey) {
      throw new Error('OpenAIProvider requires a valid API key');
    }
    this.apiKey = config.apiKey;
    this.defaultModel = config.defaultModel || 'gpt-4o-mini';
    this.baseUrl = config.baseUrl || 'https://api.openai.com/v1';
    this.timeoutMs = config.timeoutMs || 30000;
  }

  async complete(request: AICompletionRequest): Promise<AICompletionResult> {
    const startTime = Date.now();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    const model = this.defaultModel;

    const payload: Record<string, unknown> = {
      model,
      messages: request.messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      temperature: request.temperature ?? 0.3,
    };

    if (request.maxTokens) {
      payload.max_tokens = request.maxTokens;
    }

    if (request.responseFormat === 'json') {
      payload.response_format = { type: 'json_object' };
    }

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new Error(`OpenAI API error (${response.status}): ${errorText.substring(0, 200)}`);
      }

      const data = (await response.json()) as {
        choices: Array<{
          message: { content: string };
          finish_reason: string;
        }>;
        usage?: {
          prompt_tokens: number;
          completion_tokens: number;
          total_tokens: number;
        };
      };

      const choice = data.choices?.[0];
      if (!choice || !choice.message?.content) {
        throw new Error('OpenAI API returned an empty completion response');
      }

      const durationMs = Date.now() - startTime;

      return {
        content: choice.message.content,
        model,
        provider: this.name,
        usage: {
          promptTokens: data.usage?.prompt_tokens ?? 0,
          completionTokens: data.usage?.completion_tokens ?? 0,
          totalTokens: data.usage?.total_tokens ?? 0,
        },
        finishReason: choice.finish_reason || 'stop',
        durationMs,
      };
    } catch (err: unknown) {
      clearTimeout(timeoutId);
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error(`OpenAI API request timed out after ${this.timeoutMs}ms`, { cause: err });
      }
      throw err;
    }
  }

  async healthCheck(): Promise<boolean> {
    if (!this.apiKey) return false;
    try {
      const res = await fetch(`${this.baseUrl}/models`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${this.apiKey}` },
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}
