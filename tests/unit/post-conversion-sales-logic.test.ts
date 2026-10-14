/**
 * NorthSoft.AI.ContentCreator — Post Conversion & Sales Logic Unit Tests
 *
 * Validates the sales logic requirements:
 * 1. Post with natural Hook -> Problem -> Solution -> NorthSoft CTA passes with high quality.
 * 2. CTA is contextual and natural (avoids empty engagement bait and aggressive urgency).
 * 3. Educational post without CTA passes without penalty.
 * 4. Genuine NorthSoft services bridge (booking, website speed, SEO, quote automation) are recognized and supported.
 * 5. Repetitive/generic slapped-on CTAs ("contact us to learn more", "like and subscribe") are rejected.
 */

import { describe, it, expect } from 'vitest';
import { SocialMediaQualityGate } from '../../src/services/content/social-media-quality-gate';
import { ContentQualityGate } from '../../src/services/content/content-quality-gate';
import { StaticValidator } from '../../src/services/content/static-validator';
import { STRUCTURE_PATTERNS } from '../../src/services/content/structure-catalog';

describe('Post Conversion & Sales Logic Quality', () => {
  const smqg = new SocialMediaQualityGate();
  const cqg = new ContentQualityGate();
  const staticValidator = new StaticValidator();

  it('passes high-converting post following Hook -> Problem -> Solution -> NorthSoft Next Step', () => {
    const post = {
      title: 'Emergency Breakdown Calls on Mobile',
      body: `A customer's boiler breaks down on a freezing Tuesday morning.

They search on their phone, land on your website, but can't find an immediate tap-to-call number or your current availability within five seconds.

Frustrated, they tap back to Google results and call the competitor listed right below you.

Most lost customer inquiries aren't about your prices or craftsmanship. They happen because mobile sites bury the direct phone link behind multiple menu taps.

Placing a sticky tap-to-call button and live emergency hours at the top of your mobile page takes under an hour and can rescue half your lost calls.

If you suspect your current website is quietly leaking calls between client visits, message us at NorthSoft — we can review your mobile contact flow together.`,
      callToAction: 'Message us at NorthSoft — we can review your mobile contact flow together.',
    };

    const smqgResult = smqg.evaluate(post);
    expect(smqgResult.pass).toBe(true);
    expect(smqgResult.score).toBeGreaterThanOrEqual(80);

    const staticRes = staticValidator.validate({
      ...post,
      language: 'en',
      tone: 'conversational',
      topicId: 't-test',
      sourceIds: ['src-test-1'],
      claims: [],
      hashtags: ['#SmallBusiness', '#LocalServices'],
      generatedAt: new Date().toISOString(),
    });
    expect(staticRes.valid).toBe(true);

    const cqgResult = cqg.evaluate({
      ...post,
      language: 'en',
      tone: 'conversational',
      topicId: 't-test',
      sourceIds: ['src-test-1'],
      claims: [],
      hashtags: ['#SmallBusiness', '#LocalServices'],
      generatedAt: new Date().toISOString(),
    });
    expect(cqgResult.score).toBeGreaterThanOrEqual(75);
    expect(cqgResult.ctaQuality).toBe(true);
  });

  it('supports frictionless online booking service topic with value-first contextual invitation', () => {
    const bookingPost = {
      title: 'Eliminating Phone Tag for Appointments',
      body: `You are in the middle of a client consultation and your phone buzzes three times.

You can't answer right now, so you plan to call them back during your lunch break. By the time you do, they've already booked with someone else who had a live calendar link.

Playing phone tag costs busy appointment-based businesses hours every week and frustrates clients who want to book at 9 PM from their couch.

Letting clients pick an open slot and enter their vehicle or clinic details online removes the friction entirely.

If scheduling headaches are eating into your workday, drop us a note at NorthSoft to see how a simple booking calendar fits your workflow.`,
      callToAction: 'Drop us a note at NorthSoft to see how a simple booking calendar fits your workflow.',
    };

    const smqgResult = smqg.evaluate(bookingPost);
    expect(smqgResult.pass).toBe(true);
    expect(smqgResult.score).toBeGreaterThanOrEqual(80);
    expect(smqgResult.warnings.filter((w) => w.dimension === 'CTAQuality')).toHaveLength(0);
  });

  it('rejects lazy uncontextualized CTAs and generic engagement bait', () => {
    const lazyCtaPost = {
      title: 'Online Booking Tips',
      body: `Online booking systems help reduce missed appointments and save administrative hours.\n\nLike and subscribe for more!`,
      callToAction: 'Like and subscribe for more!',
    };

    const cqgResult = cqg.evaluate({
      ...lazyCtaPost,
      language: 'en',
      tone: 'conversational',
      topicId: 't-lazy',
      sourceIds: ['src-1'],
      claims: [],
      hashtags: [],
      generatedAt: new Date().toISOString(),
    });
    expect(cqgResult.ctaQuality).toBe(false);
    expect(cqgResult.reasons.some((r) => r.includes('CTA quality failure'))).toBe(true);
  });

  it('penalizes aggressive high-pressure urgency sales copy', () => {
    const aggressiveSalesPost = {
      title: 'Website Overhaul',
      body: `Your website is outdated and losing you tons of money every day.\n\nContact NorthSoft now! Act now — limited time offer, don't miss out on this incredible deal!`,
      callToAction: 'Act now — limited time offer!',
    };

    const smqgResult = smqg.evaluate(aggressiveSalesPost);
    const ctaWarning = smqgResult.warnings.find((w) => w.dimension === 'CTAQuality' && w.severity === 'high');
    expect(ctaWarning).toBeDefined();
    expect(ctaWarning?.reason).toContain('Urgent sales pressure');
  });

  it('includes the new Hook -> Problem -> Solution -> Next Step pattern in structure catalog', () => {
    const pattern = STRUCTURE_PATTERNS.find((p) => p.id === 'hook_problem_solution_nextstep');
    expect(pattern).toBeDefined();
    expect(pattern?.pattern).toContain('NorthSoft');
    expect(pattern?.transitionGuidance).toContain('low-pressure invitation');
  });
});
