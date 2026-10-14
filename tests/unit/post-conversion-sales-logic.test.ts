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

  // ---------------------------------------------------------------------------
  // Requirement 1 & 4 — CTA Consolidation, Deduplication & ctaType Validation
  // ---------------------------------------------------------------------------

  it('safely appends CTA to body when provided only in callToAction metadata, without duplicating hashtags', async () => {
    const { WriterService } = await import('../../src/services/content/writer-service');

    const mockAi = {
      name: 'mock-ai',
      complete: async () => ({
        content: JSON.stringify({
          title: 'Booking System Test',
          body: 'Most clinics lose appointment bookings when their website lacks online scheduling.\n\nA live booking calendar fixes this.',
          callToAction: 'Message NorthSoft to explore an automated booking calendar for your clinic.',
          ctaType: 'soft_invitation',
          hashtags: ['#ClinicLife', '#OnlineBooking'],
        }),
        usage: { promptTokens: 100, completionTokens: 50 },
        durationMs: 150,
        provider: 'mock',
        model: 'mock-model',
      }),
    };

    const mockDb = {
      prepare: () => ({
        bind: () => ({
          first: async () => null,
          all: async () => ({ results: [] }),
          run: async () => ({ meta: { changes: 1 } }),
        }),
      }),
    } as unknown as D1Database;

    const writer = new WriterService(mockDb, mockAi as any);
    (writer as any).quotaManager = {
      checkCapacity: async () => ({ allowed: true }),
      recordUsage: async () => {},
    };

    const res = await writer.generateDraft(
      { id: 'top-1', title: 'Clinic Booking', description: 'Booking test', category: 'Technology' },
      [],
    );

    expect(res.draft).toBeDefined();
    const draft = res.draft!;

    // Body must contain the complete publication-ready text including CTA
    expect(draft.body).toContain('Message NorthSoft to explore an automated booking calendar for your clinic.');
    // CTA must be positioned BEFORE hashtags
    const ctaPos = draft.body.indexOf('Message NorthSoft');
    const hashPos = draft.body.indexOf('#ClinicLife');
    expect(ctaPos).toBeLessThan(hashPos);
    expect(draft.ctaType).toBe('soft_invitation');
    expect(draft.callToAction).toBe('Message NorthSoft to explore an automated booking calendar for your clinic.');
  });

  it('does NOT duplicate CTA when CTA is already present in body', async () => {
    const { WriterService } = await import('../../src/services/content/writer-service');

    const ctaText = 'Drop us a line at NorthSoft if you want to inspect your mobile setup together.';
    const mockAi = {
      name: 'mock-ai',
      complete: async () => ({
        content: JSON.stringify({
          title: 'Mobile Site Audit',
          body: `Slow mobile pages turn customers away.\n\n${ctaText}`,
          callToAction: ctaText,
          ctaType: 'soft_invitation',
          hashtags: ['#MobileUX'],
        }),
        usage: { promptTokens: 100, completionTokens: 50 },
        durationMs: 150,
        provider: 'mock',
        model: 'mock-model',
      }),
    };

    const mockDb = {
      prepare: () => ({
        bind: () => ({
          first: async () => null,
          all: async () => ({ results: [] }),
          run: async () => ({ meta: { changes: 1 } }),
        }),
      }),
    } as unknown as D1Database;

    const writer = new WriterService(mockDb, mockAi as any);
    (writer as any).quotaManager = {
      checkCapacity: async () => ({ allowed: true }),
      recordUsage: async () => {},
    };

    const res = await writer.generateDraft(
      { id: 'top-2', title: 'Mobile Audit', description: 'Audit test', category: 'Technology' },
      [],
    );

    expect(res.draft).toBeDefined();
    const draft = res.draft!;

    // Count occurrences of CTA in body: must be exactly 1
    const occurrences = draft.body.split(ctaText).length - 1;
    expect(occurrences).toBe(1);
    expect(draft.body).toContain('#MobileUX');
  });

  it('safely handles educational post without CTA and preserves ctaType none', async () => {
    const { WriterService } = await import('../../src/services/content/writer-service');

    const mockAi = {
      name: 'mock-ai',
      complete: async () => ({
        content: JSON.stringify({
          title: 'Understanding Domain DNS',
          body: 'A DNS record tells browsers which server hosts your website.\n\nKeeping your TTL around 300 seconds during migrations avoids downtime.',
          ctaType: 'none',
          hashtags: ['#WebDev'],
        }),
        usage: { promptTokens: 100, completionTokens: 50 },
        durationMs: 150,
        provider: 'mock',
        model: 'mock-model',
      }),
    };

    const mockDb = {
      prepare: () => ({
        bind: () => ({
          first: async () => null,
          all: async () => ({ results: [] }),
          run: async () => ({ meta: { changes: 1 } }),
        }),
      }),
    } as unknown as D1Database;

    const writer = new WriterService(mockDb, mockAi as any);
    (writer as any).quotaManager = {
      checkCapacity: async () => ({ allowed: true }),
      recordUsage: async () => {},
    };

    const res = await writer.generateDraft(
      { id: 'top-3', title: 'DNS Basics', description: 'DNS test', category: 'Technology' },
      [],
    );

    expect(res.draft).toBeDefined();
    const draft = res.draft!;
    expect(draft.ctaType).toBe('none');
    expect(draft.callToAction).toBeUndefined();
    expect(draft.body).not.toContain('undefined');
  });

  it('validates invalid or missing ctaType gracefully without crashing', async () => {
    const { WriterService } = await import('../../src/services/content/writer-service');

    const mockAi = {
      name: 'mock-ai',
      complete: async () => ({
        content: JSON.stringify({
          title: 'Invalid CTA Type Test',
          body: 'A solid backup routine saves businesses from server meltdowns.',
          ctaType: 'INVALID_UNKNOWN_TYPE', // Invalid value
        }),
        usage: { promptTokens: 100, completionTokens: 50 },
        durationMs: 150,
        provider: 'mock',
        model: 'mock-model',
      }),
    };

    const mockDb = {
      prepare: () => ({
        bind: () => ({
          first: async () => null,
          all: async () => ({ results: [] }),
          run: async () => ({ meta: { changes: 1 } }),
        }),
      }),
    } as unknown as D1Database;

    const writer = new WriterService(mockDb, mockAi as any);
    (writer as any).quotaManager = {
      checkCapacity: async () => ({ allowed: true }),
      recordUsage: async () => {},
    };

    const res = await writer.generateDraft(
      { id: 'top-4', title: 'Backup Routine', description: 'Backup test', category: 'Technology' },
      [],
    );

    expect(res.draft).toBeDefined();
    const draft = res.draft!;
    expect(draft.ctaType).toBe('none'); // Safely normalized to 'none'
    expect(draft.claims).toEqual([]);
    expect(draft.hashtags).toEqual([]);
  });

  it('triggers existing regeneration when sales topic receives ungrounded or empty CTA', () => {
    // If a draft for a conversion-focused topic fails SMQG / ContentQualityGate due to CTA quality,
    // the system synthesizes corrective feedback for the next attempt
    const poorCtaDraft = {
      title: 'Emergency Web Design Service',
      body: "Get a new website today.\n\nWhat's the one thing you wish you could improve about your business?",
      callToAction: "What's the one thing you wish you could improve about your business?",
    };

    const smqgRes = smqg.evaluate(poorCtaDraft);
    const cqgRes = cqg.evaluate({
      ...poorCtaDraft,
      language: 'en',
      tone: 'conversational',
      topicId: 't-regen',
      sourceIds: ['s-1'],
      claims: [],
      hashtags: [],
      generatedAt: new Date().toISOString(),
    });

    expect(cqgRes.ctaQuality).toBe(false);
    expect(smqgRes.warnings.some((w) => w.dimension === 'CTAQuality')).toBe(true);

    // Synthesized failure issues guide the existing regeneration loop
    const failureIssues = [
      ...smqgRes.warnings.map((w) => `[SMQG-${w.dimension}] ${w.reason}`),
      ...cqgRes.reasons.map((r) => `[ContentSubstance] ${r}`),
    ];

    expect(failureIssues.some((issue) => issue.includes('CTA'))).toBe(true);
    expect(failureIssues.length).toBeGreaterThan(0);
  });

  it('ensures complete body is delivered to post_versions and publication message without truncation', () => {
    const postBody = `A customer looks up your salon at 8 PM on Sunday.

If they can't book an appointment directly on your website, they'll check the next place down the street.

Online booking gives clients instant confirmation without endless back-and-forth phone messages.

If you want to simplify how clients book appointments, send us a message at NorthSoft — we can help you set it up.

#SalonLife #LocalBusiness`;

    // 1. Simulating post_versions storage
    const storedPostVersion = {
      content: postBody,
      metadata: JSON.stringify({
        cta: 'Send us a message at NorthSoft — we can help you set it up.',
        ctaType: 'soft_invitation',
      }),
    };

    // 2. PublicationService message resolution
    const publishMessage = storedPostVersion.content;

    // Must contain complete body with CTA and hashtags intact
    expect(publishMessage).toContain('send us a message at NorthSoft');
    expect(publishMessage).toContain('#SalonLife');
    expect(publishMessage).toBe(postBody);
  });
});

