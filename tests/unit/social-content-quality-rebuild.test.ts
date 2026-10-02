/**
 * NorthSoft.AI.ContentCreator — Social Content Quality Rebuild Regression Tests
 *
 * Verifies the 8 core regression guarantees required by Section 27:
 * Test 1 — Paraphrase rejection: Rejects drafts that paraphrase source notes sentence-by-sentence.
 * Test 2 — Generic question rejection: Generic engagement questions lower quality and trigger warnings.
 * Test 3 — Structure: Rejects posts that collapse into a single text block.
 * Test 4 — Information gain: Requires concrete business mechanisms/scenarios beyond input notes.
 * Test 5 — Regeneration: Low quality draft triggers strategic pivot with different structure.
 * Test 6 — CTA: CTA is optional and contextual (no penalty for ending without CTA).
 * Test 7 — Brand: NorthSoft is not forced as the protagonist into every post.
 * Test 8 — Variation: Distinct topics produce varied angles, structures, and openings.
 */

import { describe, it, expect } from 'vitest';
import { SocialMediaQualityGate } from '../../src/services/content/social-media-quality-gate';
import { ContentQualityGate } from '../../src/services/content/content-quality-gate';
import { selectStructurePattern, STRUCTURE_PATTERNS } from '../../src/services/content/structure-catalog';

describe('Social Content Quality Rebuild — Regression Suite', () => {
  const smqg = new SocialMediaQualityGate();
  const cqg = new ContentQualityGate();

  const sourceTopic = {
    title: 'Grow your business with us',
    description:
      'Want to reach more customers and build a stronger online presence? Your business deserves to be seen, remembered and trusted by potential customers. We can help you build a professional online presence that supports your growth. Ready to take the next step? Get in touch with NorthSoft — we’re here to help.',
  };

  // ---------------------------------------------------------------------------
  // Test 1 — Paraphrase rejection
  // ---------------------------------------------------------------------------
  it('Test 1 — paraphrase rejection: fails a sentence-by-sentence rewrite of source text', () => {
    // The exact failing example from the problem statement
    const badParaphraseDraft = {
      title: 'Grow your business',
      body: "You want to reach more customers and build a stronger online presence. A professional online presence can help your business be seen, remembered, and trusted by potential customers. What's the one thing you wish you could improve about your online presence?",
      callToAction: "What's the one thing you wish you could improve about your online presence?",
    };

    const smqgResult = smqg.evaluate(badParaphraseDraft, {
      topicTitle: sourceTopic.title,
      referenceTexts: [sourceTopic.description],
    });

    // Must fail decisively
    expect(smqgResult.pass).toBe(false);
    expect(smqgResult.score).toBeLessThan(55);

    // Must identify information gain / paraphrase / authenticity failures
    const hasParaphraseOrInfoGainWarning = smqgResult.warnings.some(
      (w) => w.dimension === 'InformationGain' || w.dimension === 'Authenticity',
    );
    expect(hasParaphraseOrInfoGainWarning).toBe(true);

    // ContentQualityGate must also reject this draft
    const cqgResult = cqg.evaluate(
      {
        ...badParaphraseDraft,
        topicId: 't-1',
        language: 'en',
        tone: 'conversational',
        sourceIds: [],
        claims: [],
        hashtags: [],
        generatedAt: new Date().toISOString(),
      },
      sourceTopic.title,
      [sourceTopic.description],
    );
    expect(cqgResult.passed).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // Test 2 — Generic question rejection
  // ---------------------------------------------------------------------------
  it('Test 2 — generic question rejection: appending generic bait lowers score and triggers CTA warning', () => {
    const cleanPost = {
      title: 'Website Trust Factors',
      body: `A customer lands on your website. They have one question: "Can I trust this company?"\n\nWhat they see in the first 5 seconds answers that question.\n\nClear prices, current opening hours, and an address that matches Google Maps make all the difference.\n\nSimple beats fancy when the goal is clarity.`,
    };

    const baitPost = {
      title: 'Website Trust Factors',
      body: `A customer lands on your website. They have one question: "Can I trust this company?"\n\nWhat they see in the first 5 seconds answers that question.\n\nClear prices, current opening hours, and an address that matches Google Maps make all the difference.\n\nWhat's the one thing you wish you could improve about your online presence?`,
      callToAction: "What's the one thing you wish you could improve about your online presence?",
    };

    const cleanResult = smqg.evaluate(cleanPost);
    const baitResult = smqg.evaluate(baitPost);

    expect(cleanResult.pass).toBe(true);
    expect(baitResult.score).toBeLessThan(cleanResult.score);

    const ctaWarning = baitResult.warnings.find((w) => w.dimension === 'CTAQuality');
    expect(ctaWarning).toBeDefined();
    expect(ctaWarning?.reason).toMatch(/empty engagement bait/i);
  });

  // ---------------------------------------------------------------------------
  // Test 3 — Structure: rejects single-block paragraph collapse
  // ---------------------------------------------------------------------------
  it('Test 3 — structure: rejects posts that collapse into a single text block', () => {
    const singleBlockPost = {
      title: 'Local SEO Basics',
      body: `Most local businesses miss calls because their Google listing is out of date. When customers search for a plumber or mechanic on their phone, they look for three things: open hours, recent reviews, and a phone number they can tap to call immediately. If your phone number is an unclickable image or your hours say open when you are closed, customers simply move to the next business on the list without hesitation.`,
    };

    const structuredPost = {
      title: 'Local SEO Basics',
      body: `Most local businesses miss calls because their Google listing is out of date.\n\nWhen a customer searches for a tradesperson on their phone, they look for three things:\n- Current opening hours\n- Recent customer reviews\n- A phone number they can tap to call\n\nIf that phone number is plain text or your hours are wrong, they do not email you to ask. They just tap the next listing on Google.\n\nTen minutes checking your listing today can save dozens of lost enquiries this month.`,
    };

    const blockResult = smqg.evaluate(singleBlockPost);
    const structuredResult = smqg.evaluate(structuredPost);

    const readabilityWarning = blockResult.warnings.find((w) => w.dimension === 'Readability');
    expect(readabilityWarning).toBeDefined();
    expect(readabilityWarning?.reason).toMatch(/paragraph collapse/i);

    expect(structuredResult.pass).toBe(true);
    expect(structuredResult.score).toBeGreaterThan(blockResult.score);
  });

  // ---------------------------------------------------------------------------
  // Test 4 — Information gain: verifies value added beyond raw material
  // ---------------------------------------------------------------------------
  it('Test 4 — information gain: rewards posts that add concrete mechanisms and scenarios beyond source notes', () => {
    const highInfoGainPost = {
      title: 'First Impressions Online',
      body: `When a customer visits your website for the first time, they don't care about your mission statement.\n\nThey have three practical questions:\n1. Can you solve my specific problem?\n2. What does it cost or how do I get a quote?\n3. Can I easily contact a real human?\n\nIf they have to dig through five navigation menus to find a phone number, you've likely lost them.\n\nFast mobile loading, visible pricing guidance, and a one-tap phone link do more for trust than a flashy redesign.`,
    };

    const result = smqg.evaluate(highInfoGainPost, {
      topicTitle: sourceTopic.title,
      referenceTexts: [sourceTopic.description],
    });

    expect(result.pass).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(80);

    const infoGainWarning = result.warnings.find((w) => w.dimension === 'InformationGain');
    expect(infoGainWarning).toBeUndefined();
  });

  // ---------------------------------------------------------------------------
  // Test 5 — Regeneration: triggers strategic pivot with different structure
  // ---------------------------------------------------------------------------
  it('Test 5 — regeneration: selects a different structure pattern on subsequent attempts', async () => {
    const attempt1 = await selectStructurePattern(undefined, undefined, 1);
    expect(attempt1.pattern).toBeDefined();

    // On attempt 2, forcing previousPatternId ensures that a different pattern is selected
    const attempt2 = await selectStructurePattern(undefined, undefined, 2, attempt1.pattern.id);
    expect(attempt2.pattern.id).not.toBe(attempt1.pattern.id);
  });

  // ---------------------------------------------------------------------------
  // Test 6 — CTA is optional and contextual
  // ---------------------------------------------------------------------------
  it('Test 6 — CTA: post without a CTA passes with high quality score', () => {
    const noCtaPost = {
      title: 'Website Loading Speed',
      body: `A site that takes more than three seconds to load loses almost half its mobile visitors before the page renders.\n\nMost of that lag comes from two things:\n- High-resolution smartphone photos uploaded without compression\n- Old tracking scripts nobody looks at anymore\n\nCompressing images and removing dead plugins takes under twenty minutes and costs nothing.\n\nSpeed is the quietest way to respect your customer's time.`,
    };

    const result = smqg.evaluate(noCtaPost);
    expect(result.pass).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(85);

    const ctaWarning = result.warnings.find((w) => w.dimension === 'CTAQuality');
    expect(ctaWarning).toBeUndefined();
  });

  // ---------------------------------------------------------------------------
  // Test 7 — Brand: NorthSoft is not forced as hero
  // ---------------------------------------------------------------------------
  it('Test 7 — brand: excellent post without any NorthSoft mention passes completely', () => {
    const readerHeroPost = {
      title: 'Invoicing Automation',
      body: `Chasing late invoices on a Friday evening is nobody's idea of running a business.\n\nAutomated payment reminders sent 48 hours before the due date cut overdue accounts by nearly a third for most trades.\n\nCustomers aren't ignoring you on purpose — they just get busy. A polite automatic SMS with a direct payment link makes paying effortless.`,
    };

    const result = smqg.evaluate(readerHeroPost);
    expect(result.pass).toBe(true);
    expect(readerHeroPost.body).not.toContain('NorthSoft');

    const brandWarning = result.warnings.find((w) => w.dimension === 'BrandPlacement');
    expect(brandWarning).toBeUndefined();
  });

  // ---------------------------------------------------------------------------
  // Test 8 — Variation across topics
  // ---------------------------------------------------------------------------
  it('Test 8 — variation: catalog offers multiple distinct reasoning patterns', () => {
    expect(STRUCTURE_PATTERNS.length).toBeGreaterThanOrEqual(10);

    const patternIds = new Set(STRUCTURE_PATTERNS.map((p) => p.id));
    expect(patternIds.size).toBe(STRUCTURE_PATTERNS.length);

    // Verify key diverse patterns exist
    expect(patternIds.has('scenario_problem_insight')).toBe(true);
    expect(patternIds.has('observation_implication_action')).toBe(true);
    expect(patternIds.has('myth_reality_implication')).toBe(true);
    expect(patternIds.has('mistake_consequence_better')).toBe(true);
    expect(patternIds.has('before_after_contrast')).toBe(true);
  });
});
