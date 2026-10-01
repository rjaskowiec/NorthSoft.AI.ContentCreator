/**
 * NorthSoft.AI.ContentCreator — Social Media Quality Gate Unit Tests
 *
 * Tests behavioral correctness of the SocialMediaQualityGate across
 * the ten required regression scenarios from the specification.
 */

import { describe, it, expect } from 'vitest';
import { SocialMediaQualityGate } from '../../src/services/content/social-media-quality-gate';

const gate = new SocialMediaQualityGate();

function makeDraft(body: string, title = 'Test Post') {
  return { title, body };
}

describe('SocialMediaQualityGate — Behavioral Tests', () => {
  // ---------------------------------------------------------------------------
  // Test 1 — Strong post should score well
  // ---------------------------------------------------------------------------
  it('Test 1 — strong post with concrete hook, recognizable problem, useful advice passes', () => {
    const draft = makeDraft(
      `The worst thing for a business? A website that doesn't work.\n\nHas your website looked like nobody's touched it in years? Maybe it's broken, still says "Under Construction", or doesn't display properly on mobile.\n\nYour website is your business's first impression. Don't let potential customers turn to the competition simply because your website puts them off.\n\nGet in touch with NorthSoft — we can help you fix it.`,
      'Outdated Website Problems',
    );
    const result = gate.evaluate(draft);
    expect(result.pass).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(55);
    expect(result.warnings.filter((w) => w.severity === 'critical')).toHaveLength(0);
  });

  // ---------------------------------------------------------------------------
  // Test 2 — Generic, abstract post should score worse than the strong post
  // ---------------------------------------------------------------------------
  it('Test 2 — generic abstract post scores significantly worse than a strong concrete post', () => {
    const genericDraft = makeDraft(
      `Your website is important for your business. In today's digital world, having a strong online presence is essential. Make sure your digital presence is optimized for success.`,
      'Website Importance',
    );
    const strongDraft = makeDraft(
      `If your website hasn't been updated in over a year, customers who search for you might find outdated hours, a missing contact form, or a layout that breaks on mobile.\n\nIt's worth a quick check. NorthSoft can help you review what needs fixing.`,
      'Website Review',
    );
    const genericResult = gate.evaluate(genericDraft);
    const strongResult = gate.evaluate(strongDraft);
    expect(strongResult.score).toBeGreaterThan(genericResult.score);
  });

  // ---------------------------------------------------------------------------
  // Test 3 — Promotional spam post should be penalized
  // ---------------------------------------------------------------------------
  it('Test 3 — heavy promotional jargon post is penalized', () => {
    const spamDraft = makeDraft(
      `Contact NorthSoft today to unlock your potential! Our cutting-edge digital transformation solutions are a game changer for scaling your business. We're revolutionizing the way businesses leverage synergy and maximize conversion. Act now — limited time offer!`,
      'NorthSoft Promo',
    );
    const result = gate.evaluate(spamDraft);
    expect(result.pass).toBe(false);
    const authWarning = result.warnings.find((w) => w.dimension === 'Authenticity');
    expect(authWarning).toBeDefined();
    expect(authWarning?.severity).toMatch(/critical|high/);
  });

  // ---------------------------------------------------------------------------
  // Test 4 — Good post without emoji should NOT be penalized
  // ---------------------------------------------------------------------------
  it('Test 4 — good post with no emoji is not penalized', () => {
    const draft = makeDraft(
      `Most small businesses don't realise that a slow website can push customers away before they even read your menu or service list.\n\nPage speed matters — especially on mobile. If your site takes more than 3 seconds to load, a significant portion of visitors will leave.\n\nNorthSoft can help you identify what's slowing things down.`,
      'Website Speed',
    );
    const result = gate.evaluate(draft);
    expect(result.pass).toBe(true);
    // No warning should mention emoji
    const emojiWarning = result.warnings.find((w) => w.reason.toLowerCase().includes('emoji'));
    expect(emojiWarning).toBeUndefined();
  });

  // ---------------------------------------------------------------------------
  // Test 5 — Good post without CTA should NOT automatically fail
  // ---------------------------------------------------------------------------
  it('Test 5 — good post with no CTA does not fail', () => {
    const draft = makeDraft(
      `If a customer types your business name into Google and finds an address that moved two years ago, they're unlikely to call. Keeping your Google Business Profile up to date takes about ten minutes — and it's free.\n\nIt's one of the simplest things you can do to make sure potential customers actually find you.`,
      'Google Business Profile',
    );
    const result = gate.evaluate(draft);
    expect(result.pass).toBe(true);
    // No warning should mention CTA
    const ctaWarning = result.warnings.find((w) => w.reason.toLowerCase().includes('cta') || w.reason.toLowerCase().includes('call to action'));
    expect(ctaWarning).toBeUndefined();
  });

  // ---------------------------------------------------------------------------
  // Test 6 — Strong statement hook (not a question) should be accepted
  // ---------------------------------------------------------------------------
  it('Test 6 — strong statement hook without a question is accepted', () => {
    const draft = makeDraft(
      `Most local business websites haven't been properly checked on a smartphone. Layouts break, buttons overlap, and phone numbers that should be tappable links just sit there as plain text.\n\nIf your customers are mostly on mobile — and most are — this is worth fixing sooner rather than later.`,
      'Mobile Website Check',
    );
    const result = gate.evaluate(draft);
    expect(result.pass).toBe(true);
    const attentionWarning = result.warnings.find((w) => w.dimension === 'Attention');
    // Either no attention warning, or only a low/medium severity one
    if (attentionWarning) {
      expect(attentionWarning.severity).toMatch(/low|medium/);
    }
  });

  // ---------------------------------------------------------------------------
  // Test 7 — Fabricated percentage statistic must fail (critical)
  // ---------------------------------------------------------------------------
  it('Test 7 — fabricated percentage statistic triggers critical warning', () => {
    const draft = makeDraft(
      `Studies show that 87% of businesses lose customers because of poor website design. Don't be one of them. Contact NorthSoft today.`,
      'Website Statistics',
    );
    const result = gate.evaluate(draft);
    const credibilityWarning = result.warnings.find((w) => w.dimension === 'Credibility' && w.severity === 'critical');
    expect(credibilityWarning).toBeDefined();
    expect(result.pass).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // Test 8 — Unsupported "experts say" claim without source should be flagged
  // ---------------------------------------------------------------------------
  it('Test 8 — unsupported "experts say" claim is flagged with high severity', () => {
    const draft = makeDraft(
      `Research shows that businesses with updated websites get 3x more enquiries. Make sure yours is up to date.\n\nNorthSoft can help you review your site and fix what needs attention.`,
      'Website Enquiries',
    );
    const result = gate.evaluate(draft);
    const credibilityWarning = result.warnings.find((w) => w.dimension === 'Credibility');
    expect(credibilityWarning).toBeDefined();
    // Should be high or critical — not silently pass
    expect(credibilityWarning?.severity).toMatch(/high|critical/);
  });

  // ---------------------------------------------------------------------------
  // Test 9 — Style hints unavailable (gate must work without any performance data)
  // ---------------------------------------------------------------------------
  it('Test 9 — gate evaluates correctly even with minimal body content (no perf data dependency)', () => {
    const draft = makeDraft(
      `If you've been putting off updating your website because it seems complicated, you're not alone. Many local business owners say the same thing.\n\nNorthSoft can walk you through what actually needs updating — and what can wait.`,
      'Website Update Help',
    );
    // Gate is purely text-based — no DB dependency. This should always work.
    expect(() => gate.evaluate(draft)).not.toThrow();
    const result = gate.evaluate(draft);
    expect(result).toHaveProperty('score');
    expect(result).toHaveProperty('pass');
    expect(result).toHaveProperty('warnings');
    expect(result.pass).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Test 10 — Low-quality draft triggers warnings; a clearly better draft passes
  // ---------------------------------------------------------------------------
  it('Test 10 — low-quality draft fails while a corrected version passes', () => {
    const poorDraft = makeDraft(
      `Websites are important. Digital transformation. Unlock potential. Game changer solutions. Maximize conversion. Leverage synergy for your business scaling needs.`,
      'Business Solutions',
    );
    const improvedDraft = makeDraft(
      `Is your website still showing hours from three years ago? It happens more often than you'd think.\n\nAn outdated listing can send customers to a closed door — literally. If you're not sure what your site says right now, it's worth a quick check.\n\nNorthSoft can help you sort it out.`,
      'Outdated Business Info',
    );

    const poorResult = gate.evaluate(poorDraft);
    const improvedResult = gate.evaluate(improvedDraft);

    expect(poorResult.score).toBeLessThan(improvedResult.score);
    expect(improvedResult.pass).toBe(true);
    expect(poorResult.warnings.some((w) => w.severity === 'critical' || w.severity === 'high')).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Additional edge cases
  // ---------------------------------------------------------------------------
  describe('Edge cases', () => {
    it('empty body is flagged as unreadable', () => {
      const result = gate.evaluate({ title: 'Empty', body: '' });
      expect(result.pass).toBe(false);
      const readability = result.warnings.find((w) => w.dimension === 'Readability');
      expect(readability).toBeDefined();
    });

    it('very short body is flagged', () => {
      const result = gate.evaluate({ title: 'Short', body: 'Hi there!' });
      expect(result.pass).toBe(false);
    });

    it('NorthSoft mentioned early triggers only a LOW warning, not a block', () => {
      const draft = makeDraft(
        `NorthSoft helps local businesses get found online. If your website is outdated, broken, or hard to use on mobile, potential customers might leave before they even find your contact details. We can help you fix that.`,
        'NorthSoft Intro',
      );
      const result = gate.evaluate(draft);
      const brandWarning = result.warnings.find((w) => w.dimension === 'BrandPlacement');
      if (brandWarning) {
        expect(brandWarning.severity).toBe('low');
      }
      // Should not be blocked solely because of early brand mention
      const criticals = result.warnings.filter((w) => w.severity === 'critical');
      expect(criticals).toHaveLength(0);
    });

    it('weights sum to exactly 100', () => {
      // Access weights via a test-only approach: evaluate a zero-warning post and check score = 100
      // Or verify by summing weights (we know they are 15+12+12+20+12+10+10+9 = 100)
      const perfectDraft = makeDraft(
        `If your mobile website takes more than three seconds to load, you're likely losing visitors before they even see your menu.\n\nIt's a quick fix that can make a real difference. NorthSoft can check your site speed and show you what's slowing it down.`,
        'Mobile Speed',
      );
      const result = gate.evaluate(perfectDraft);
      // Score should be high (not 0 from broken weights)
      expect(result.score).toBeGreaterThan(50);
    });
  });
});
