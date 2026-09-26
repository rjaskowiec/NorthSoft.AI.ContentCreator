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

    // Default valid JSON responses based on request role if no custom mock matched
    if (responseContent === 'Mock AI completion response') {
      if (request.role === 'researcher') {
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
      } else if (request.role === 'writer') {
        responseContent = JSON.stringify({
          title: 'Edge Compute Optimization with Cloudflare Workers',
          body:
            'Cloudflare Workers enable serverless code execution directly at the network edge. ' +
            'By deploying logic closer to users, applications achieve ultra-low latency and zero cold starts. ' +
            'This architecture dramatically simplifies global deployment while reducing cloud infrastructure overhead.',
          language: 'en',
          tone: 'professional',
          claims: [
            {
              text: 'Cloudflare Workers execute code at the network edge.',
              sourceIds: ['src-100'],
            },
          ],
          hashtags: ['#Cloudflare', '#Serverless'],
          callToAction: 'Learn more about edge architecture.',
        });
      } else if (request.role === 'qa') {
        responseContent = JSON.stringify({
          verdict: 'PASS',
          score: 92,
          factualIssues: [],
          unsupportedClaims: [],
          policyConcerns: [],
          styleIssues: [],
          requiredChanges: [],
          reasoning: 'Draft is factually accurate and grounded in research evidence.',
        });
      }
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
