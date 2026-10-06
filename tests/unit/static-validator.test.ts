import { describe, expect, it } from 'vitest';
import { StaticValidator } from '../../src/services/content/static-validator';
import type { PostDraft } from '../../src/services/content/writer-service';

describe('StaticValidator — Deterministic Content Rules', () => {
  const validator = new StaticValidator();

  const validDraft: PostDraft = {
    title: 'Modern Cloud Infrastructure with Cloudflare Workers',
    body:
      'Cloudflare Workers enable serverless code execution directly at the network edge. ' +
      'By deploying logic closer to users, applications achieve ultra-low latency and zero cold starts. ' +
      'This architecture dramatically simplifies global deployment while reducing cloud infrastructure overhead.',
    language: 'en',
    tone: 'professional',
    topicId: 'topic-1',
    sourceIds: ['src-1'],
    claims: [
      { text: 'Cloudflare Workers execute code at the network edge.', sourceIds: ['src-1'] },
    ],
    hashtags: ['#Cloudflare', '#Serverless'],
    generatedAt: new Date().toISOString(),
  };

  it('passes valid post draft within length and quality guidelines', () => {
    const res = validator.validate(validDraft);
    expect(res.valid).toBe(true);
    expect(res.errors).toHaveLength(0);
  });

  it('fails draft with empty body text', () => {
    const invalidDraft = { ...validDraft, body: '' };
    const res = validator.validate(invalidDraft);
    expect(res.valid).toBe(false);
    expect(res.errors).toContain('Post body text is empty.');
  });

  it('fails draft with body under 100 characters', () => {
    const shortDraft = { ...validDraft, body: 'Too short.' };
    const res = validator.validate(shortDraft);
    expect(res.valid).toBe(false);
    expect(res.errors[0]).toContain('too short');
  });

  it('fails draft with body over 2000 characters', () => {
    const longDraft = { ...validDraft, body: 'A'.repeat(2050) };
    const res = validator.validate(longDraft);
    expect(res.valid).toBe(false);
    expect(res.errors[0]).toContain('exceeds maximum allowed length');
  });

  it('fails draft with more than 4 hashtags', () => {
    const hashtagDraft = { ...validDraft, hashtags: ['#One', '#Two', '#Three', '#Four', '#Five'] };
    const res = validator.validate(hashtagDraft);
    expect(res.valid).toBe(false);
    expect(res.errors[0]).toContain('Too many hashtags');
  });

  it('fails draft containing prohibited clickbait patterns', () => {
    const clickbaitDraft = { ...validDraft, body: validDraft.body + ' This is exciting news! 🚀' };
    const res = validator.validate(clickbaitDraft);
    expect(res.valid).toBe(false);
    expect(res.errors[0]).toContain('prohibited clickbait');
  });

  it('fails draft containing placeholder text', () => {
    const placeholderDraft = { ...validDraft, body: validDraft.body + ' [insert link here]' };
    const res = validator.validate(placeholderDraft);
    expect(res.valid).toBe(false);
    expect(res.errors[0]).toContain('placeholder text');
  });

  it('fails draft missing research source references', () => {
    const ungroundedDraft = { ...validDraft, sourceIds: [] };
    const res = validator.validate(ungroundedDraft);
    expect(res.valid).toBe(false);
    expect(res.errors[0]).toContain('missing associated research source references');
  });

  describe('Structural Discrepancy Validation (Declared Count vs List Items)', () => {
    it('fails when draft claims "5 key takeaways" but only contains 3 bullet points', () => {
      const discrepancyDraft: PostDraft = {
        ...validDraft,
        body:
          'Want to know the secret to building a marketing team that can handle it all?\n' +
          'Learn how AI can help you automate tasks, save time, and focus on high-leverage activities.\n\n' +
          'Here are 5 key takeaways to get you started:\n\n' +
          '• Build a team of specialist agents for research, writing, design, and analytics\n' +
          '• Automate repetitive tasks to free up more time for strategy and creativity\n' +
          '• Focus on high-leverage activities that drive real results\n\n' +
          'How can you start leveraging AI to build your dream marketing team?',
      };

      const res = validator.validate(discrepancyDraft);
      expect(res.valid).toBe(false);
      expect(res.errors.some((e) => e.includes('claims 5 takeaways but body contains 3 list items'))).toBe(true);
    });

    it('passes when draft claims "5 key takeaways" and contains exactly 5 bullet points', () => {
      const valid5Draft: PostDraft = {
        ...validDraft,
        body:
          'Want to know the secret to building a marketing team that can handle it all?\n' +
          'Learn how AI can help you automate tasks, save time, and focus on high-leverage activities.\n\n' +
          'Here are 5 key takeaways to get you started:\n\n' +
          '• Item 1: Build a team of specialist agents for research and writing\n' +
          '• Item 2: Automate repetitive tasks to free up time for strategy\n' +
          '• Item 3: Focus on high-leverage activities that drive results\n' +
          '• Item 4: Implement continuous feedback loops across all agents\n' +
          '• Item 5: Measure business impact and scale top performing content\n\n' +
          'How can you start leveraging AI today?',
      };

      const res = validator.validate(valid5Draft);
      expect(res.valid).toBe(true);
    });

    it('passes when draft claims "3 reasons" and contains exactly 3 numbered items', () => {
      const numbered3Draft: PostDraft = {
        ...validDraft,
        body:
          'Here are 3 reasons why serverless compute is transforming modern web development:\n\n' +
          '1. Instant global scaling without managing servers or Kubernetes clusters.\n' +
          '2. Zero cold starts when running logic directly at edge data centers.\n' +
          '3. Significant cost savings by paying strictly for execution duration.\n\n' +
          'Start deploying your application to the edge today!',
      };

      const res = validator.validate(numbered3Draft);
      expect(res.valid).toBe(true);
    });

    it('fails when draft claims "3 reasons" but contains only 2 numbered items', () => {
      const discrepancy3Draft: PostDraft = {
        ...validDraft,
        body:
          'Here are 3 reasons why serverless compute is transforming modern web development:\n\n' +
          '1. Instant global scaling without managing servers.\n' +
          '2. Zero cold starts when running logic directly at edge.\n\n' +
          'Start deploying today!',
      };

      const res = validator.validate(discrepancy3Draft);
      expect(res.valid).toBe(false);
      expect(res.errors.some((e) => e.includes('claims 3 reasons but body contains 2 list items'))).toBe(true);
    });

    it('fails when draft claims "7 ways" but contains only 4 bullet points', () => {
      const discrepancy7Draft: PostDraft = {
        ...validDraft,
        body:
          'Here are 7 ways to scale your business with edge computing:\n\n' +
          '- Way 1: Global caching\n' +
          '- Way 2: Edge databases\n' +
          '- Way 3: Automated image optimization\n' +
          '- Way 4: Fine-grained security headers\n\n' +
          'Try these strategies now!',
      };

      const res = validator.validate(discrepancy7Draft);
      expect(res.valid).toBe(false);
      expect(res.errors.some((e) => e.includes('claims 7 ways but body contains 4 list items'))).toBe(true);
    });

    it('passes when draft claims "7 ways" and contains exactly 7 bullet points', () => {
      const valid7Draft: PostDraft = {
        ...validDraft,
        body:
          'Here are 7 ways to scale your business with edge computing:\n\n' +
          '- Way 1: Global caching\n' +
          '- Way 2: Edge databases\n' +
          '- Way 3: Automated image optimization\n' +
          '- Way 4: Fine-grained security headers\n' +
          '- Way 5: Zero cold starts\n' +
          '- Way 6: Low latency routing\n' +
          '- Way 7: Reduced infrastructure costs\n\n' +
          'Try these strategies now!',
      };

      const res = validator.validate(valid7Draft);
      expect(res.valid).toBe(true);
    });
  });
});
