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

  it('fails draft with more than 3 hashtags', () => {
    const hashtagDraft = { ...validDraft, hashtags: ['#One', '#Two', '#Three', '#Four'] };
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
});
