/**
 * NorthSoft.AI.ContentCreator — Content Quality Gate Unit Tests
 *
 * Tests semantic validation, substantive value evaluation, anti-filler detection,
 * list item substance, topic alignment, and CTA quality checks.
 */

import { describe, it, expect } from 'vitest';
import { ContentQualityGate } from '../../src/services/content/content-quality-gate';
import type { PostDraft } from '../../src/services/content/writer-service';

function makeDraft(overrides: Partial<PostDraft>): PostDraft {
  return {
    topicId: 'topic-test-1',
    title: 'Test Title',
    body: 'Test Body',
    claims: [{ text: 'Claim 1', sourceIds: ['src-1'] }],
    hashtags: ['#test'],
    callToAction: 'What do you think?',
    sourceIds: ['src-1'],
    language: 'pl',
    tone: 'professional',
    generatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('ContentQualityGate', () => {
  const qualityGate = new ContentQualityGate();

  describe('PASS Test Cases', () => {
    it('1. should PASS short, but concrete post (website storefront example)', () => {
      const draft = makeDraft({
        title: 'Digital Storefront Best Practices',
        body: `Your website is your digital storefront. If customers can't understand what you offer within a few seconds, they'll probably leave. Make your main value proposition clear, put your contact information somewhere obvious, and make sure the site works properly on mobile.

What's the first thing you look for when visiting a business website?`,
        hashtags: ['#webdesign', '#business'],
        callToAction: "What's the first thing you look for when visiting a business website?",
      });

      const result = qualityGate.evaluate(draft, 'Digital Storefront Best Practices');
      expect(result.passed).toBe(true);
      expect(result.score).toBeGreaterThanOrEqual(60);
      expect(result.substantiveValue).toBe(true);
    });

    it('2. should PASS post with practical local business tips', () => {
      const draft = makeDraft({
        title: 'Local Business Website Checklist',
        body: "If you're creating a website for a local business, make sure your contact information is visible above the fold, your Google Business Profile is linked, and the site works well on mobile.",
        hashtags: ['#localbusiness', '#seo'],
        callToAction: 'How often do you update your business listing?',
      });

      const result = qualityGate.evaluate(draft, 'Local Business Website Checklist');
      expect(result.passed).toBe(true);
      expect(result.substantiveValue).toBe(true);
    });

    it('3. should PASS list where each item contains substantive information', () => {
      const draft = makeDraft({
        title: '3 ways to reduce website loading time',
        body: `Here are 3 actionable ways to speed up your website loading time:

1. Compress large images before uploading them — oversized JPEGs and PNGs can significantly increase page load time.
2. Enable browser caching so returning visitors don't have to download the same assets again.
3. Remove unnecessary JavaScript and third-party scripts that delay page rendering.

Which of these optimizations have you implemented on your site?`,
        hashtags: ['#webdev', '#performance'],
        callToAction: 'Which of these optimizations have you implemented on your site?',
      });

      const result = qualityGate.evaluate(draft, '3 ways to reduce website loading time');
      expect(result.passed).toBe(true);
      expect(result.listItemSubstance).toBe(true);
      expect(result.substantiveValue).toBe(true);
    });

    it('4. should PASS post with natural contextual CTA', () => {
      const draft = makeDraft({
        title: 'Improving User Engagement',
        body: 'User engagement relies on clear visual hierarchy and quick feedback loops. When users click a button, show a loading indicator or immediate UI change so they know the app responded.',
        hashtags: ['#ux', '#frontend'],
        callToAction: 'Which of these website issues have you encountered? Let us know in the comments.',
      });

      const result = qualityGate.evaluate(draft, 'Improving User Engagement');
      expect(result.passed).toBe(true);
      expect(result.ctaQuality).toBe(true);
    });

    it('5. should PASS non-list post with concrete technical value', () => {
      const draft = makeDraft({
        title: 'Database Indexing Insight',
        body: 'Adding indexes to frequently queried foreign keys in Cloudflare D1 can reduce query latency from 150ms to under 5ms, avoiding table scans during high concurrent traffic.',
        hashtags: ['#database', '#cloudflare'],
        callToAction: 'Do you audit your SQL execution plans regularly?',
      });

      const result = qualityGate.evaluate(draft, 'Database Indexing Insight');
      expect(result.passed).toBe(true);
      expect(result.substantiveValue).toBe(true);
    });

    it('6. should PASS short, logically coherent post', () => {
      const draft = makeDraft({
        title: 'Clean Code Principle',
        body: 'Functions should do one thing well. When a single method handles validation, network requests, and database persistence, refactoring it into smaller single-responsibility helpers makes testing trivial.',
        hashtags: ['#cleancode', '#architecture'],
        callToAction: 'How do you handle unit testing for legacy codebases?',
      });

      const result = qualityGate.evaluate(draft, 'Clean Code Principle');
      expect(result.passed).toBe(true);
      expect(result.logicalCoherence).toBe(true);
    });
  });

  describe('FAIL Test Cases', () => {
    it('1. MUST FAIL "3 ways to prepare herring" tautological empty list example', () => {
      const draft = makeDraft({
        title: '3 ways to prepare herring',
        body: `3 ways to prepare herring:

1. Buy herring.
2. Prepare herring.
3. Eat herring.

Follow us for more tips!`,
        hashtags: ['#recipes', '#tips'],
        callToAction: 'Follow us for more tips!',
      });

      const result = qualityGate.evaluate(draft, '3 ways to prepare herring');
      expect(result.passed).toBe(false);
      expect(result.listItemSubstance).toBe(false);
      expect(result.ctaQuality).toBe(false);
      expect(result.substantiveValue).toBe(false);
      expect(result.reasons).toEqual(
        expect.arrayContaining([
          expect.stringMatching(/List items lack substantive explanation|generic, uncontextualized CTA/i),
        ]),
      );
    });

    it('2. MUST FAIL business tips filler with generic empty advice', () => {
      const draft = makeDraft({
        title: '5 ways to improve your business',
        body: `5 ways to improve your business:

1. Work harder.
2. Plan better.
3. Use technology.
4. Focus on customers.
5. Keep improving.

What do you think?`,
        hashtags: ['#business', '#growth'],
        callToAction: 'What do you think?',
      });

      const result = qualityGate.evaluate(draft, '5 ways to improve your business');
      expect(result.passed).toBe(false);
      expect(result.noEmptyAdvice).toBe(false);
      expect(result.substantiveValue).toBe(false);
    });

    it('3. MUST FAIL topic mismatch (SEO title talking exclusively about social media)', () => {
      const draft = makeDraft({
        title: '5 ways to improve your website SEO',
        body: `Here are top tips to grow your online presence:

1. Post daily Instagram reels with trending audio.
2. Use relevant hashtags in every post.
3. Engage with followers in Instagram comments.

What do you think?`,
        hashtags: ['#marketing'],
        callToAction: 'What do you think?',
      });

      const result = qualityGate.evaluate(draft, '5 ways to improve your website SEO');
      expect(result.passed).toBe(false);
      expect(result.topicAlignment).toBe(false);
    });

    it('4. MUST FAIL list containing duplicate or repeated items', () => {
      const draft = makeDraft({
        title: '3 tips for better code quality',
        body: `Here are 3 tips for writing clean code:

1. Write unit tests for core modules.
2. Write unit tests for core modules.
3. Use automated linter tools.

How do you test your code?`,
        hashtags: ['#coding'],
        callToAction: 'How do you test your code?',
      });

      const result = qualityGate.evaluate(draft, '3 tips for better code quality');
      expect(result.passed).toBe(false);
      expect(result.logicalCoherence).toBe(false);
    });

    it('5. MUST FAIL post consisting predominantly of filler phrases', () => {
      const draft = makeDraft({
        title: 'Success strategies',
        body: `To succeed in business, you must work harder, plan better, use technology, stay ahead of the competition, focus on your goals, know your audience, have a good strategy, and be consistent.`,
        hashtags: ['#success'],
        callToAction: 'Stay tuned!',
      });

      const result = qualityGate.evaluate(draft, 'Success strategies');
      expect(result.passed).toBe(false);
      expect(result.noEmptyAdvice).toBe(false);
    });

    it('6. MUST FAIL automatically slapped-on generic CTA', () => {
      const draft = makeDraft({
        title: 'Useful CSS Flexbox tips',
        body: `Flexbox makes centering elements straightforward. Set display: flex and align-items: center on the container to center vertically.

Follow us for more tips!`,
        hashtags: ['#css'],
        callToAction: 'Follow us for more tips!',
      });

      const result = qualityGate.evaluate(draft, 'Useful CSS Flexbox tips');
      expect(result.passed).toBe(false);
      expect(result.ctaQuality).toBe(false);
    });

    it('7. MUST FAIL post formally matching structure but offering zero real value', () => {
      const draft = makeDraft({
        title: '5 tips for a better website',
        body: `5 tips for a better website:

1. Have a good design.
2. Be mobile friendly.
3. Use SEO.
4. Be fast.
5. Have good content.

Follow us for more tips!`,
        hashtags: ['#website'],
        callToAction: 'Follow us for more tips!',
      });

      const result = qualityGate.evaluate(draft, '5 tips for a better website');
      expect(result.passed).toBe(false);
      expect(result.substantiveValue).toBe(false);
      expect(result.noEmptyAdvice).toBe(false);
      expect(result.ctaQuality).toBe(false);
    });
  });
});
