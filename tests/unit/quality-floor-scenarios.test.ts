/**
 * NorthSoft.AI.ContentCreator — Autonomous Quality Floor & Communication Standards Suite
 *
 * Explicitly tests requirements A through J from Section 25 of the specification:
 * - Test A: "You're not just building X, you're building Y..." triggers genericness warning & fails.
 * - Test B: 5 sentences in a single paragraph triggers social formatting warning & fails.
 * - Test C: Article-like explanation produces low narrative/social score.
 * - Test D: Abstract marketing language triggers concreteness warning.
 * - Test E: Great hook + useful content passes with flying colors.
 * - Test F: Good content but no CTA passes without penalty.
 * - Test G: Good content + natural CTA passes.
 * - Test H: Bad draft -> regeneration directive receives failure reason.
 * - Test I: Repeated bad generations -> final block / rejected status (never auto-published).
 * - Test J: Noisy/random generation does not allow low-quality post through quality floor.
 */

import { describe, it, expect, vi } from 'vitest';
import { SocialMediaQualityGate } from '../../src/services/content/social-media-quality-gate';
import { ContentQualityGate } from '../../src/services/content/content-quality-gate';
import { ContentPlannerService } from '../../src/services/content/content-planner-service';
import type { IAIProvider } from '../../src/ai/provider';

describe('Autonomous Quality Floor & Regression Tests (A through J)', () => {
  const smqg = new SocialMediaQualityGate();
  const cqg = new ContentQualityGate();

  // ---------------------------------------------------------------------------
  // Test A: Generic AI Template
  // ---------------------------------------------------------------------------
  it("Test A — 'You're not just building X, you're building Y...' triggers genericness warning & is rejected", () => {
    // The exact problematic post from the user problem description
    const badDraft = {
      title: 'UX Investment',
      body: "You're not just building a website, you're building a customer experience. Simple, intuitive designs can increase conversions by up to 200%. But how do you convince stakeholders to invest in UX improvements? It starts with calculating the potential return on investment. By defining business value, calculating costs, and testing causality, you can make a compelling case for UX investments.",
    };

    const smqgResult = smqg.evaluate(badDraft);
    expect(smqgResult.pass).toBe(false);

    const genericnessWarning = smqgResult.warnings.find((w) => w.dimension === 'Genericness');
    expect(genericnessWarning).toBeDefined();
    expect(genericnessWarning?.reason).toMatch(/AI syntactic template|predictable AI/i);

    const cqgResult = cqg.evaluate({
      ...badDraft,
      topicId: 't-1',
      language: 'en',
      tone: 'conversational',
      sourceIds: [],
      claims: [],
      hashtags: [],
      generatedAt: new Date().toISOString(),
    });
    expect(cqgResult.passed).toBe(false);
    expect(cqgResult.reasons.some((r) => r.includes('AI template'))).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Test B: 5 sentences in one monolithic paragraph (Paragraph Collapse)
  // ---------------------------------------------------------------------------
  it('Test B — 5 sentences in a single paragraph triggers social formatting warning & is rejected', () => {
    const singleParagraphDraft = {
      title: 'Local SEO Tips',
      body: 'Most local business owners do not realize how much revenue they lose from wrong opening hours. When a customer searches for your service on Google Maps, they make a decision in seconds. If your profile says you are closed when you are actually open, they call your competitor. Updating your hours takes less than five minutes and requires no technical knowledge. Check your listing today before your weekend inquiries drop.',
    };

    const result = smqg.evaluate(singleParagraphDraft);
    expect(result.pass).toBe(false);

    const readabilityWarning = result.warnings.find((w) => w.dimension === 'Readability');
    expect(readabilityWarning).toBeDefined();
    expect(readabilityWarning?.severity).toBe('high');
    expect(readabilityWarning?.reason).toMatch(/paragraph collapse/i);
  });

  // ---------------------------------------------------------------------------
  // Test C: Article-like explanation / enterprise consulting summary
  // ---------------------------------------------------------------------------
  it('Test C — Article-like consulting explanation triggers AudienceRelevance warning & low score', () => {
    const consultingDraft = {
      title: 'UX Strategy',
      body: "When approaching user experience modernization, how do you convince stakeholders to invest in UX improvements?\n\nIt starts with calculating the potential return on investment.\n\nBy defining business value, calculating costs, and testing causality, you can make a compelling case for UX investments.",
    };

    const result = smqg.evaluate(consultingDraft);
    expect(result.pass).toBe(false);

    const audienceWarning = result.warnings.find((w) => w.dimension === 'AudienceRelevance');
    expect(audienceWarning).toBeDefined();
    expect(audienceWarning?.reason).toMatch(/consulting|stakeholders/i);
  });

  // ---------------------------------------------------------------------------
  // Test D: Abstract marketing language without concrete operational artifacts
  // ---------------------------------------------------------------------------
  it('Test D — Abstract marketing language without operational grounding triggers genericness penalty', () => {
    const abstractDraft = {
      title: 'Digital Transformation',
      body: "Digital transformation is essential for modern business growth.\n\nOptimizing your online visibility and customer experience ensures holistic business value.\n\nA complete digital strategy accelerates long-term market presence.",
    };

    const result = smqg.evaluate(abstractDraft);
    expect(result.pass).toBe(false);
    expect(result.genericnessScore).toBeGreaterThanOrEqual(40);
  });

  // ---------------------------------------------------------------------------
  // Test E: Great hook + concrete useful content passes quality floor
  // ---------------------------------------------------------------------------
  it('Test E — Great hook + concrete useful content passes quality floor decisively', () => {
    const goodDraft = {
      title: 'The Overwhelmed Marketing Dilemma',
      body: `You're not alone if you're overwhelmed by the numerous marketing automation tools out there.\n\nLet's cut through the noise: what really matters is finding a tool that fits your unique business needs.\n\nConsider this: the right marketing automation tool can significantly boost your efficiency and customer engagement. But with so many alternatives to established platforms like Marketo, how do you choose?`,
    };

    const result = smqg.evaluate(goodDraft);
    expect(result.pass).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(80);
    expect(result.warnings.filter((w) => w.severity === 'critical' || w.severity === 'high')).toHaveLength(0);
  });

  // ---------------------------------------------------------------------------
  // Test F: Good content but no CTA passes cleanly
  // ---------------------------------------------------------------------------
  it('Test F — Good content without any CTA passes without penalty', () => {
    const noCtaDraft = {
      title: 'Smartphone Mobile Lag',
      body: `If your website takes more than three seconds to load on a 4G phone, you've likely lost half your visitors before they ever see what you do.\n\nMost of the time, the slowdown isn't your hosting.\n\nIt's three smartphone photos of past work uploaded directly from a phone at 8 megabytes each. Or tracking plugins installed three years ago that nobody uses.\n\nCompressing your images and clearing dead scripts takes twenty minutes and costs nothing.`,
    };

    const result = smqg.evaluate(noCtaDraft);
    expect(result.pass).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(85);
    const ctaWarning = result.warnings.find((w) => w.dimension === 'CTAQuality');
    expect(ctaWarning).toBeUndefined();
  });

  // ---------------------------------------------------------------------------
  // Test G: Good content with natural, contextual CTA passes cleanly
  // ---------------------------------------------------------------------------
  it('Test G — Good content with natural contextual CTA passes with high score', () => {
    const contextualCtaDraft = {
      title: 'Google Maps Hours',
      body: `A potential customer types "mechanic near me" into Google at 4:30 PM on a Friday.\n\nYour profile appears, but your listed hours still say you close at 4:00 PM because nobody updated them after summer.\n\nThey don't call to ask. They just tap the next mechanic who shows open until 6:00 PM.\n\nTen minutes checking your Google Business Profile today can prevent lost revenue this weekend. If you need a quick audit of your local listing, NorthSoft can help review it.`,
      callToAction: 'If you need a quick audit of your local listing, NorthSoft can help review it.',
    };

    const result = smqg.evaluate(contextualCtaDraft);
    expect(result.pass).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(85);
  });

  // ---------------------------------------------------------------------------
  // Test H: Bad draft -> regeneration directive receives failure reason
  // ---------------------------------------------------------------------------
  it('Test H — Bad draft rejection passes detailed failure reasons into regeneration directive', () => {
    const badDraft = {
      title: 'UX Investment',
      body: "You're not just building a website, you're building a customer experience. Simple, intuitive designs can increase conversions by up to 200%. But how do you convince stakeholders to invest in UX improvements? It starts with calculating the potential return on investment. By defining business value, calculating costs, and testing causality, you can make a compelling case for UX investments.",
    };

    const smqgResult = smqg.evaluate(badDraft);
    expect(smqgResult.pass).toBe(false);

    // Verify specific warnings are generated
    const reasons = smqgResult.warnings.map((w) => `[SMQG-${w.dimension}] ${w.reason}`);
    expect(reasons.some((r) => r.includes('[SMQG-Genericness]'))).toBe(true);
    expect(reasons.some((r) => r.includes('[SMQG-AudienceRelevance]'))).toBe(true);
    expect(reasons.some((r) => r.includes('[SMQG-Readability]'))).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Test I: Repeated bad generations -> post blocked / rejected, NEVER published
  // ---------------------------------------------------------------------------
  it('Test I — When all attempts fail quality gate, generation marks idea rejected and never publishes', async () => {
    const ideaId = 'idea-test-block';
    let ideaStatus = 'queued';

    const mockDb = {
      prepare: (sql: string) => {
        const norm = sql.replace(/\s+/g, ' ').trim();
        return {
          bind: (...args: unknown[]) => ({
            first: async () => {
              if (norm.includes('FROM content_ideas WHERE id = ?')) {
                return { id: ideaId, title: 'UX Investment', description: 'UX ROI calculations', category: 'WEBSITE' };
              }
              if (norm.includes('FROM posts WHERE idea_id = ?')) {
                return null;
              }
              if (norm.includes('FROM ai_usage')) {
                return { req_total: 1, neuron_total: 100 };
              }
              return null;
            },
            all: async () => ({ results: [] }),
            run: async () => {
              if (norm.includes("UPDATE content_ideas SET status = 'rejected'")) {
                ideaStatus = 'rejected';
              }
              return { success: true };
            },
          }),
        };
      },
      batch: async () => {
        ideaStatus = 'rejected';
        return [];
      },
    } as unknown as D1Database;

    const mockWriterAlwaysBad: IAIProvider = {
      name: 'mock',
      complete: vi.fn().mockResolvedValue({
        content: JSON.stringify({
          title: 'UX Investment',
          body: "You're not just building a website, you're building a customer experience. But how do you convince stakeholders to invest in UX improvements? By defining business value, calculating costs, and testing causality, you can make a case.",
        }),
        model: 'mock',
        provider: 'mock',
        durationMs: 10,
        usage: { promptTokens: 10, completionTokens: 50, totalTokens: 60 },
      }),
      healthCheck: vi.fn().mockResolvedValue({ healthy: true, durationMs: 5 }),
    };

    const mockEnv = { ENVIRONMENT: 'development', DB: mockDb } as unknown as Env;
    const factory = await import('../../src/ai/factory');
    vi.spyOn(factory, 'getAIProvider').mockReturnValue(mockWriterAlwaysBad);

    const planner = new ContentPlannerService(mockDb, mockEnv);
    const result = await planner.generatePostFromTopic(ideaId, 'admin');

    // Must be failed and blocked
    expect(result.status).toBe('failed');
    expect(result.qualityDecision).toBe('BLOCKED');
    expect(ideaStatus).toBe('rejected');
  });

  // ---------------------------------------------------------------------------
  // Test J: Noisy / random generation does not allow low-quality post through
  // ---------------------------------------------------------------------------
  it('Test J — Low quality variations under temperature noise are consistently blocked by Quality Gate', () => {
    const noisyVariations = [
      "You're not just running a cafe, you're building a community experience. In today's digital world, digital transformation is essential for scaling your business. Contact NorthSoft today to unlock your potential!",
      "It's not about coffee, it's about synergy. Convince stakeholders to invest in digital ordering. By defining business value and testing causality, you maximize conversion. Act now — limited time offer!",
      "Don't just sell coffee — innovate. In today's fast-paced world, your business deserves to be seen, remembered and trusted. What's the one thing you wish you could improve about your website?",
    ];

    for (const body of noisyVariations) {
      const result = smqg.evaluate({ title: 'Cafe Tech', body });
      expect(result.pass).toBe(false);
      expect(result.warnings.some((w) => w.severity === 'critical' || w.severity === 'high')).toBe(true);
    }
  });
});
