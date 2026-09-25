import { describe, expect, it } from 'vitest';
import { PolicyReviewService } from '../../src/services/content/policy-service';
import type { PostDraft } from '../../src/services/content/writer-service';

describe('PolicyReviewService — Brand & Compliance Policy Rules', () => {
  const policyService = new PolicyReviewService();

  const safeDraft: PostDraft = {
    title: 'Modern Software Architecture Practices',
    body:
      'Adopting micro-services and serverless functions allows engineering teams to ship features rapidly ' +
      'while isolating system dependencies and maintaining zero downtime deployments.',
    language: 'en',
    tone: 'professional',
    topicId: 'topic-1',
    sourceIds: ['src-1'],
    claims: [],
    hashtags: ['#WebDev'],
    generatedAt: new Date().toISOString(),
  };

  it('passes compliant technical draft with LOW risk level', () => {
    const res = policyService.evaluate(safeDraft);
    expect(res.passed).toBe(true);
    expect(res.violations).toHaveLength(0);
    expect(res.riskLevel).toBe('LOW');
  });

  it('rejects post containing spam/vulnerability keywords', () => {
    const spamDraft = {
      ...safeDraft,
      body: safeDraft.body + ' Learn how to bypass security controls now.',
    };
    const res = policyService.evaluate(spamDraft);
    expect(res.passed).toBe(false);
    expect(res.violations[0]).toContain('prohibited compliance keyword');
  });

  it('rejects post containing artificial engagement baiting', () => {
    const baitDraft = { ...safeDraft, body: safeDraft.body + ' Like and share if you agree!' };
    const res = policyService.evaluate(baitDraft);
    expect(res.passed).toBe(false);
    expect(res.violations[0]).toContain('engagement baiting');
  });

  it('rejects post containing unsubstantiated financial/performance guarantees', () => {
    const guaranteeDraft = {
      ...safeDraft,
      body: safeDraft.body + ' We guarantee 100% profit with zero risk.',
    };
    const res = policyService.evaluate(guaranteeDraft);
    expect(res.passed).toBe(false);
    expect(res.violations[0]).toContain('unsubstantiated guarantee');
  });
});
