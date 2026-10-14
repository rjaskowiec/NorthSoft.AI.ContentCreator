import { describe, expect, it } from 'vitest';
import { checkEditorialBrandSafety } from '../../src/services/content/editorial-policy';
import { PolicyReviewService } from '../../src/services/content/policy-service';
import { validateCandidateIdeaOutput } from '../../src/services/research/validator';
import type { PostDraft } from '../../src/services/content/writer-service';

describe('Editorial Brand Safety & Editorial Policy', () => {
  const policyService = new PolicyReviewService();

  const baseDraft: PostDraft = {
    title: 'Preparing Your Local Shop for the December Rush',
    body: `A customer lands on your store website at 9 PM looking for last-minute gifts.
If your checkout is slow or payment options are confusing, they tap back to Google and order from the nearest competitor.

Preparing your mobile shop for peak demand starts with simplifying the cart down to two taps.

If you want a quick review of your online checkout before the rush hits, send us a message at NorthSoft.`,
    language: 'en',
    tone: 'conversational',
    topicId: 'topic-seasonal',
    sourceIds: ['src-1'],
    claims: [],
    hashtags: ['#SmallBusiness', '#Ecommerce'],
    callToAction: 'Send us a message at NorthSoft.',
    ctaType: 'soft_invitation',
    imageSearchQuery: 'retail store counter checkout laptop',
    generatedAt: new Date().toISOString(),
  };

  it('allows neutral seasonal business topics (December rush, Black Friday, January goals) without religious framing', () => {
    const res = policyService.evaluate(baseDraft);
    expect(res.passed).toBe(true);
    expect(res.violations).toHaveLength(0);
    expect(res.riskLevel).toBe('LOW');

    const blackFridayDraft: PostDraft = {
      ...baseDraft,
      title: 'Is Your Website Ready for Black Friday Traffic Spikes?',
      body: `During Black Friday, a one-second server slowdown can mean lost sales every hour.
Testing server caching and optimizing images now gives your store room to handle traffic smoothly.

Message NorthSoft to run a quick speed audit on your online store before the sale weekend starts.`,
      hashtags: ['#BlackFriday', '#WebPerformance'],
    };
    const bfRes = policyService.evaluate(blackFridayDraft);
    expect(bfRes.passed).toBe(true);
  });

  it('strictly rejects religious references, holidays, ceremonies, and doctrines (RELIGION)', () => {
    const religiousDraft: PostDraft = {
      ...baseDraft,
      title: 'Christmas Deals for Church Congregations',
      body: 'Celebrate this Christmas with our special software blessings and church prayer schedules.',
      hashtags: ['#Christmas', '#Church'],
    };

    const res = policyService.evaluate(religiousDraft);
    expect(res.passed).toBe(false);
    expect(res.violations.some((v) => v.includes('[RELIGION]'))).toBe(true);
  });

  it('strictly rejects sexuality, erotica, and suggestive adult references (SEXUALITY)', () => {
    const eroticDraft: PostDraft = {
      ...baseDraft,
      title: 'Promoting Adult OnlyFans & Erotic Massages Online',
      body: 'How to market sensual erotic massage salons and NSFW content without bans.',
      hashtags: ['#NSFW'],
    };

    const res = policyService.evaluate(eroticDraft);
    expect(res.passed).toBe(false);
    expect(res.violations.some((v) => v.includes('[SEXUALITY]'))).toBe(true);
  });

  it('strictly rejects occultism, tarot, horoscopes, and supernatural themes (OCCULTISM)', () => {
    const occultDraft: PostDraft = {
      ...baseDraft,
      title: 'What the Horoscope Predicts for Your Business Astrology',
      body: 'Consulting tarot cards and psychic readings to choose your next tech strategy.',
      hashtags: ['#Horoscope', '#Astrology'],
    };

    const res = policyService.evaluate(occultDraft);
    expect(res.passed).toBe(false);
    expect(res.violations.some((v) => v.includes('[OCCULTISM]'))).toBe(true);
  });

  it('strictly rejects gambling, betting, casinos, and lotteries (GAMBLING)', () => {
    const gamblingDraft: PostDraft = {
      ...baseDraft,
      title: 'Top Crypto Casino Bonuses and Sports Betting Platforms',
      body: 'Place your sports betting wager today on our licensed slot machines and poker rooms.',
      hashtags: ['#Casino', '#SportsBetting'],
    };

    const res = policyService.evaluate(gamblingDraft);
    expect(res.passed).toBe(false);
    expect(res.violations.some((v) => v.includes('[GAMBLING]'))).toBe(true);
  });

  it('strictly rejects recreational drugs and inappropriate themes (INAPPROPRIATE)', () => {
    const inappropriateDraft: PostDraft = {
      ...baseDraft,
      title: 'Getting High on Recreational Weed for Creativity',
      body: 'Why marijuana and magic mushrooms help founders relax after hours.',
    };

    const res = policyService.evaluate(inappropriateDraft);
    expect(res.passed).toBe(false);
    expect(res.violations.some((v) => v.includes('[INAPPROPRIATE]'))).toBe(true);
  });

  it('rejects prohibited topics at the Research Scout validator stage before database insertion', () => {
    const prohibitedIdeaOutput = JSON.stringify({
      usefulAngle: true,
      title: 'Christian Church Easter Sunday Social Media Campaign',
      angle: 'Connecting bible scripture with parish community gatherings',
      hook: 'How can your church reach more believers this Easter?',
      summary: 'Preparing parish communications for religious celebrations',
      keyPoints: ['Use church bulletin software', 'Share daily prayers on social media'],
      contentPillar: 'MARKETING',
      clusterKey: 'lead_response_time',
      engagementQuestion: 'How does your parish connect with new members?',
    });

    const validationRes = validateCandidateIdeaOutput(prohibitedIdeaOutput);
    expect(validationRes.valid).toBe(false);
    expect(validationRes.errors?.some((err) => err.includes('[RELIGION]'))).toBe(true);
  });

  it('accepts forward-looking business seasonal preparation at Research Scout stage', () => {
    const validSeasonalOutput = JSON.stringify({
      usefulAngle: true,
      title: 'Preparing Your Tourist Booking Website for Summer Visitors',
      angle: 'Opening online calendar reservations 3 months in advance captures early travelers',
      hook: 'Tourists book summer excursions in February.',
      summary: 'Why local activity operators lose bookings if reservations open too late',
      keyPoints: ['Enable live calendar availability', 'Accept mobile deposits upfront'],
      contentPillar: 'WEBSITE',
      clusterKey: 'local_service_booking',
      engagementQuestion: 'When do you open your advance reservation calendar?',
    });

    const validationRes = validateCandidateIdeaOutput(validSeasonalOutput);
    expect(validationRes.valid).toBe(true);
    expect(validationRes.data?.title).toContain('Summer Visitors');
  });

  it('validates image search queries and hashtags against editorial brand safety', () => {
    const safeImageCheck = checkEditorialBrandSafety({
      imageQuery: 'mechanic reviewing digital tablet in garage workshop',
      hashtags: ['#LocalBusiness', '#Mechanic'],
    });
    expect(safeImageCheck.passed).toBe(true);

    const prohibitedImageCheck = checkEditorialBrandSafety({
      imageQuery: 'roulette wheel inside a neon casino',
      hashtags: ['#CasinoNight'],
    });
    expect(prohibitedImageCheck.passed).toBe(false);
    expect(prohibitedImageCheck.categoryViolations).toContain('GAMBLING');
  });
});
