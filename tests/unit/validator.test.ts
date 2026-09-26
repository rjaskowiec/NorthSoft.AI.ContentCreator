import { describe, expect, it } from 'vitest';
import { validateCandidateTopicOutput } from '../../src/services/research/validator';

describe('AI Output Validator', () => {
  it('validates a well-formed JSON candidate topic', () => {
    const validJson = JSON.stringify({
      title: 'Cloudflare Announces Hyperdrive GA',
      summary: 'Hyperdrive accelerates database connections for Workers developers globally.',
      sourceUrl: 'https://blog.cloudflare.com/hyperdrive-ga/',
      sourceName: 'Cloudflare Blog',
      publishedAt: '2026-09-25T10:00:00Z',
      relevanceScore: 94,
      categories: ['Cloudflare', 'WebDev'],
      keyClaims: ['Faster DB queries', 'Global connection pooling'],
      whyRelevant: 'Directly impacts modern serverless web development architectures.',
      confidence: 0.96,
    });

    const result = validateCandidateTopicOutput(validJson);
    expect(result.valid).toBe(true);
    expect(result.data?.title).toBe('Cloudflare Announces Hyperdrive GA');
    expect(result.data?.relevanceScore).toBe(94);
    expect(result.data?.categories).toEqual(['Cloudflare', 'WebDev']);
  });

  it('handles JSON wrapped in markdown code blocks', () => {
    const markdownWrapped = `\`\`\`json
{
  "title": "New Security Features in .NET 10",
  "summary": "Microsoft announces enhanced cryptography APIs in .NET 10.",
  "sourceUrl": "https://devblogs.microsoft.com/dotnet/sec-features/",
  "sourceName": ".NET Blog",
  "relevanceScore": 85,
  "categories": [".NET"],
  "keyClaims": ["Enhanced crypto APIs"],
  "whyRelevant": "Relevant for enterprise software engineering.",
  "confidence": 0.9
}
\`\`\``;

    const result = validateCandidateTopicOutput(markdownWrapped);
    expect(result.valid).toBe(true);
    expect(result.data?.title).toBe('New Security Features in .NET 10');
  });

  it('rejects malformed JSON and missing required fields', () => {
    const malformed = 'Not a JSON object at all!';
    const res1 = validateCandidateTopicOutput(malformed);
    expect(res1.valid).toBe(false);
    expect(res1.errors?.[0]).toContain('Failed to parse AI output as JSON');

    const missingTitle = JSON.stringify({
      title: 'Hi', // Too short
      summary: 'Summary ok',
      sourceUrl: 'not-a-url',
    });

    const res2 = validateCandidateTopicOutput(missingTitle);
    expect(res2.valid).toBe(false);
    expect(res2.errors?.length).toBeGreaterThan(0);
  });
});
