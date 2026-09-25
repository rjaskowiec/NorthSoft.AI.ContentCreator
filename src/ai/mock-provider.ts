/**
 * NorthSoft.AI.ContentCreator — Mock AI Provider
 *
 * Used for unit testing and offline development.
 */

import type { AICompletionRequest, AICompletionResult, IAIProvider } from './provider';

export class MockAIProvider implements IAIProvider {
  readonly name = 'mock';
  private mockResponses: Map<string, string> = new Map();
  public shouldFail = false;
  public failureMessage = 'Mock AI Provider error';

  setMockResponse(keySubstring: string, responseJsonOrText: string): void {
    this.mockResponses.set(keySubstring, responseJsonOrText);
  }

  async complete(request: AICompletionRequest): Promise<AICompletionResult> {
    if (this.shouldFail) {
      throw new Error(this.failureMessage);
    }

    const userPrompt = request.messages.find((m) => m.role === 'user')?.content || '';
    let responseContent = 'Mock AI completion response';

    for (const [key, value] of this.mockResponses.entries()) {
      if (userPrompt.includes(key)) {
        responseContent = value;
        break;
      }
    }

    // Default valid research JSON response if request role is researcher and no custom mock matched
    if (request.role === 'researcher' && responseContent === 'Mock AI completion response') {
      responseContent = JSON.stringify({
        title: 'Mock AI Topic Analysis',
        summary: 'A structured candidate topic derived from research sources.',
        sourceUrl: 'https://blog.cloudflare.com/rss/',
        sourceName: 'Cloudflare Blog',
        publishedAt: new Date().toISOString(),
        relevanceScore: 88,
        categories: ['Cloudflare', 'AI'],
        keyClaims: ['Claim 1', 'Claim 2'],
        whyRelevant: 'Relevant to small business technology and modern cloud infrastructure.',
        confidence: 0.95,
      });
    }

    return {
      content: responseContent,
      model: 'mock-model-v1',
      provider: this.name,
      usage: {
        promptTokens: 150,
        completionTokens: 80,
        totalTokens: 230,
      },
      finishReason: 'stop',
      durationMs: 45,
    };
  }

  async healthCheck(): Promise<boolean> {
    return !this.shouldFail;
  }
}
