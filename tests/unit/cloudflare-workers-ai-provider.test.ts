import { describe, expect, it, vi } from 'vitest';
import { CloudflareWorkersAIProvider } from '../../src/ai/cloudflare-workers-ai-provider';

describe('CloudflareWorkersAIProvider structured output', () => {
  it('requests JSON mode and serializes a structured response object', async () => {
    const structuredResponse = { verdict: 'PASS', score: 91 };
    const run = vi.fn().mockResolvedValue({ response: structuredResponse });
    const provider = new CloudflareWorkersAIProvider({ aiBinding: { run } });

    const result = await provider.complete({
      role: 'qa',
      messages: [{ role: 'user', content: 'Review this post.' }],
      responseFormat: 'json',
    });

    expect(run).toHaveBeenCalledWith(
      '@cf/meta/llama-3.1-8b-instruct',
      expect.objectContaining({ response_format: { type: 'json_object' } }),
    );
    expect(JSON.parse(result.content)).toEqual(structuredResponse);
    expect(result.model).toBe('@cf/meta/llama-3.1-8b-instruct');
  });

  it('keeps plain-text requests out of JSON mode', async () => {
    const run = vi.fn().mockResolvedValue({ response: 'Plain response' });
    const provider = new CloudflareWorkersAIProvider({ aiBinding: { run } });

    const result = await provider.complete({
      role: 'writer',
      messages: [{ role: 'user', content: 'Write a post.' }],
      responseFormat: 'text',
    });

    const payload = run.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(payload).not.toHaveProperty('response_format');
    expect(result.content).toBe('Plain response');
  });
});
