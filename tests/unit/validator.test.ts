import { describe, expect, it } from 'vitest';
import {
  validateCandidateIdeaOutput,
  validateCandidateTopicOutput,
} from '../../src/services/research/validator';

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

    const res2 = validateCandidateIdeaOutput(missingTitle);
    expect(res2.valid).toBe(false);
    expect(res2.errors?.length).toBeGreaterThan(0);
  });

  it('validates and extracts transformed idea output with market phenomenon and customer opportunity', async () => {
    const { validateCandidateIdeaOutput } = await import('../../src/services/research/validator');
    const validIdeaJson = JSON.stringify({
      usefulAngle: true,
      marketPhenomenon:
        'Search engines are deploying generative AI answers directly on SERP pages.',
      customerOpportunity:
        'Small businesses risk zero-click dropoff unless their websites have clear structured answers.',
      clusterKey: 'ai_search_visibility',
      title: 'Is Your Website Visible When Customers Search With AI?',
      angle:
        'Show local business owners how simple FAQ structured answers keep them visible in AI overviews.',
      hook: 'When someone asks ChatGPT for a local recommendation, does your business appear?',
      summary: 'Why structured website content is essential for modern search visibility.',
      keyPoints: ['Generative answers bypass standard links', 'Structured FAQs win citations'],
      contentPillar: 'AI',
      postType: 'TIPS',
      engagementQuestion: 'Have you tested how AI answers describe your services?',
      commercialRelevance: 90,
      engagementPotential: 85,
      relevanceScore: 88,
    });

    const res = validateCandidateIdeaOutput(validIdeaJson);
    expect(res.valid).toBe(true);
    expect(res.data?.marketPhenomenon).toBe(
      'Search engines are deploying generative AI answers directly on SERP pages.',
    );
    expect(res.data?.customerOpportunity).toBe(
      'Small businesses risk zero-click dropoff unless their websites have clear structured answers.',
    );
    expect(res.data?.clusterKey).toBe('ai_search_visibility');
    expect(res.data?.contentPillar).toBe('AI');
  });

  it('validates a batch of candidate ideas returned as { ideas: [...] }', async () => {
    const { validateBatchCandidateIdeasOutput } = await import('../../src/services/research/validator');
    const batchJson = JSON.stringify({
      ideas: [
        {
          title: 'Speed Up Your Mobile Site to Stop Losing Inquiries',
          angle: 'Show local business owners why a 3-second load delay cuts inquiries in half.',
          hook: 'How many customers click away before your mobile page even finishes loading?',
          summary: 'Why Core Web Vitals directly determine inquiry volume for service firms.',
          keyPoints: ['53% of mobile visits are abandoned after 3 seconds', 'Compressing images cuts load time immediately'],
          contentPillar: 'WEBSITE',
          clusterKey: 'website_speed_conversion',
          commercialRelevance: 90,
          engagementPotential: 85,
          relevanceScore: 90,
        },
        {
          title: 'Weekend Customer Inquiries: Stop Losing Leads After 5 PM',
          angle: 'Explain how simple automated responders capture leads while the office is closed.',
          hook: 'What happens when an excited prospect messages your business on Saturday night?',
          summary: 'How small businesses capture 40% more leads with simple automated response workflows.',
          keyPoints: ['Prospects expect immediate acknowledgment', 'An automated quote scheduler locks in the client'],
          contentPillar: 'AI',
          clusterKey: 'chatbot_first_touch',
          commercialRelevance: 95,
          engagementPotential: 90,
          relevanceScore: 92,
        },
      ],
    });

    const res = validateBatchCandidateIdeasOutput(batchJson);
    expect(res.valid).toBe(true);
    expect(res.data).toHaveLength(2);
    expect(res.data?.[0]?.title).toBe('Speed Up Your Mobile Site to Stop Losing Inquiries');
    expect(res.data?.[1]?.clusterKey).toBe('chatbot_first_touch');
  });
});

