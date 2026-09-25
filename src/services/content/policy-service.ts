/**
 * NorthSoft.AI.ContentCreator — Policy & Compliance Review Service
 *
 * Enforces brand compliance, spam prevention, and deceptive content safety.
 * Runs fast deterministic checks first to save AI Neurons before optional AI review.
 */

import type { PostDraft } from './writer-service';

export interface PolicyReviewResult {
  passed: boolean;
  violations: string[];
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
}

export const PROHIBITED_POLICY_WORDS = [
  /\bguaranteed returns\b/i,
  /\b100% free money\b/i,
  /\bget rich quick\b/i,
  /\bsecret hack\b/i,
  /\bpasswords revealed\b/i,
  /\bbypass security\b/i,
  /\billegal download\b/i,
];

export class PolicyReviewService {
  /**
   * Evaluates deterministic policy compliance rules against a post draft.
   */
  evaluate(draft: PostDraft): PolicyReviewResult {
    const violations: string[] = [];

    // 1. Prohibited spam / security vulnerability keywords
    for (const pattern of PROHIBITED_POLICY_WORDS) {
      if (pattern.test(draft.body) || pattern.test(draft.title)) {
        violations.push(`Post content matched prohibited compliance keyword pattern: ${pattern}.`);
      }
    }

    // 2. Misleading Engagement Patterns
    if (/\b(like and share|comment below to win|tag a friend)\b/i.test(draft.body)) {
      violations.push('Post contains prohibited artificial engagement baiting language.');
    }

    // 3. Unsubstantiated Financial / Performance Guarantees
    if (/\b(guarantee|guaranteed|100% profit|zero risk)\b/i.test(draft.body)) {
      violations.push('Post contains prohibited unsubstantiated guarantee claims.');
    }

    const passed = violations.length === 0;
    const riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' = passed
      ? 'LOW'
      : violations.length > 1
        ? 'HIGH'
        : 'MEDIUM';

    return {
      passed,
      violations,
      riskLevel,
    };
  }
}
